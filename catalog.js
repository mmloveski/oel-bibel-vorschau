const grid = document.querySelector('#oil-grid');
const search = document.querySelector('#search');
const count = document.querySelector('#result-count');
const empty = document.querySelector('#empty');
const loadMore = document.querySelector('#load-more');
const buttons = [...document.querySelectorAll('.filter')];
const home = document.querySelector('#themen');
const browse = document.querySelector('#entdecken');
const topicGroups = document.querySelector('#topic-groups');
const browseTitle = document.querySelector('#explore-title');
const browseContext = document.querySelector('#browse-context');
const homeSearch = document.querySelector('#home-search');
const hero = document.querySelector('.hero');
const detail = document.querySelector('#oel-detail');
const detailContent = document.querySelector('#detail-content');
const protectedData = window.__OEL_DATA__ || null;
const placeholderImage = protectedData?.placeholder || 'produktbild-platzhalter.svg';

let oils = [];
let topics = [];
let imageById = {};
let shopById = {};
let activeTopic = null;
let activeFilter = 'Alle';
let shown = 40;
let lastListHash = '#oele';
let lastListQuery = '';
let lastListFilter = 'Alle';
let restoreListState = false;

function normalized(value) {
  return String(value || '').toLocaleLowerCase('de').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss');
}

function element(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}

function displayName(product) {
  return shopById[product.id]?.display_name || product.name;
}

function sourceLabel(source) {
  const printed = source.book_pages?.length
    ? `Gedruckte Buchseite${source.book_pages.length > 1 ? 'n' : ''} ${source.book_pages.join(', ')}`
    : '';
  const digital = source.reader_page != null ? `Digitale Buchseite ${source.reader_page}` : '';
  return [printed, digital].filter(Boolean).join(' · ') || 'Fundstelle in der Ölbibel';
}

function sourceLink(source, label) {
  if (protectedData?.publicPreview) {
    return element('span', 'source-link', (label || sourceLabel(source)).replace(' öffnen', ''));
  }
  const link = element('a', 'source-link', label || sourceLabel(source));
  link.href = source.reader_url;
  return link;
}

function bookSection(label, value, className = '', extraSource = null) {
  const section = element('div', className);
  section.append(element('span', 'book-label', label));
  section.append(element('p', 'book-text', value));
  if (extraSource) section.append(sourceLink(extraSource, `Zusätzliche Quelle · ${sourceLabel(extraSource)}`));
  return section;
}

function appendMentions(details, product) {
  if (details.dataset.loaded) return;
  const list = element('ol', 'mention-list');
  for (const mention of product.mentions) {
    const item = element('li');
    item.append(element('span', '', mention.excerpt + ' '));
    const link = sourceLink(mention.source, sourceLabel(mention.source));
    item.append(link);
    list.append(item);
  }
  details.append(list);
  details.dataset.loaded = 'true';
}

function renderCard(product) {
  const card = element('article', 'card detail-card');
  card.dataset.type = product.type;
  const figure = element('figure', 'product-image');
  const image = element('img');
  const shopImage = imageById[product.id];
  image.src = shopImage?.path || placeholderImage;
  image.alt = shopImage ? `Young Living Produktfoto: ${shopImage.title}` : `Bildplatzhalter für ${product.name}`;
  image.width = 250;
  image.height = 250;
  image.loading = 'lazy';
  image.addEventListener('error', () => { image.onerror = null; image.src = placeholderImage; }, { once: true });
  figure.append(image);
  const caption = element('figcaption');
  if (shopImage) {
    const link = element('a', '', `Produktfoto: Young Living ${shopImage.market}`);
    link.href = shopById[product.id]?.url || shopImage.product_url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    caption.append(link);
  } else {
    caption.textContent = 'Kein eindeutig zugeordnetes Shopfoto';
  }
  figure.append(caption);

  const content = element('div', 'card-content');
  const top = element('div', 'card-top');
  top.append(element('span', 'type', product.type));
  const chips = element('div', 'tags');
  for (const match of product.topicMatches) {
    const topic = topics.find(item => item.id === match.topic);
    if (!topic) continue;
    const chip = element('button', 'tag tag-topic', topic.title);
    chip.type = 'button';
    chip.title = `${topic.title}: passende Öle ansehen`;
    chip.addEventListener('click', () => { location.hash = `thema/${topic.id}`; });
    chips.append(chip);
  }
  top.append(chips);
  content.append(top, element('h1', '', displayName(product)));
  if (displayName(product) !== product.name) {
    content.append(element('p', 'source-note', `In der Ölbibel: ${product.name}`));
  }

  if (activeTopic) {
    const match = product.topicMatches.find(item => item.topic === activeTopic);
    if (match) {
      const topic = topics.find(item => item.id === activeTopic);
      const evidence = bookSection(`Warum bei „${topic.title}“?`, match.evidence, 'topic-evidence');
      evidence.append(sourceLink(match.source, `Beleg im Buch · ${sourceLabel(match.source)}`));
      content.append(evidence);
    }
  }

  const extraSource = field => product.field_sources?.[field]?.reader_page !== product.source.reader_page
    ? product.field_sources[field] : null;
  if (product.description) {
    content.append(bookSection('Beschreibung aus der Ölbibel', product.description, '', extraSource('description')));
  } else {
    content.append(bookSection('Beschreibung', 'Im Produktverzeichnis genannt; eine eigene Beschreibung wurde beim automatischen Import nicht zugeordnet.', 'source-note'));
  }
  if (product.areas) content.append(bookSection('Im Buch genannte Themen', product.areas, '', extraSource('areas')));
  if (product.usage) content.append(bookSection('Nutzung laut Ölbibel', product.usage, 'usage', extraSource('usage')));
  if (product.caution) content.append(bookSection('Hinweis im Buch', product.caution, '', extraSource('caution')));
  if (!product.usage) content.append(element('p', 'source-note', product.shared_profile
    ? 'Für dieses Roll-on nennt das gemeinsame Buchprofil keine getrennt ausgewiesene Nutzung.'
    : 'Keine eigene Anwendungsempfehlung im zugeordneten Buchprofil gefunden.'));
  content.append(sourceLink(product.source, `${product.directory_only ? 'Verzeichniseintrag' : 'Buchprofil'} öffnen · ${sourceLabel(product.source)}`));

  if (product.mentions.length) {
    const details = element('details', 'mentions');
    details.append(element('summary', '', `Weitere automatisch gefundene Nennungen (${product.mentions.length})`));
    details.addEventListener('toggle', () => {
      if (details.open) appendMentions(details, product);
    });
    content.append(details);
  }
  card.append(figure, content);
  return card;
}

function renderRow(product) {
  const row = element('a', 'oil-row');
  row.href = `#oel/${encodeURIComponent(product.id)}`;
  row.addEventListener('click', () => {
    lastListHash = location.hash;
    lastListQuery = search.value;
    lastListFilter = activeFilter;
  });
  const photo = element('img');
  const shopImage = imageById[product.id];
  photo.src = shopImage?.path || placeholderImage;
  photo.alt = '';
  photo.width = 68;
  photo.height = 68;
  photo.loading = 'lazy';
  photo.addEventListener('error', () => { photo.onerror = null; photo.src = placeholderImage; }, { once: true });
  const main = element('span', 'row-main');
  main.append(element('strong', '', displayName(product)));
  const meta = element('span', 'row-meta');
  meta.append(element('span', 'type', product.type));
  const selected = [...product.topicMatches].sort((a, b) =>
    Number(b.topic === activeTopic) - Number(a.topic === activeTopic));
  for (const match of selected.slice(0, 3)) {
    const topic = topics.find(item => item.id === match.topic);
    if (topic) meta.append(element('span', 'tag', topic.title));
  }
  if (!selected.length) meta.append(element('span', 'source-note', 'Noch ohne Themenlabel'));
  main.append(meta);
  row.append(photo, main, element('span', 'row-arrow', '→'));
  return row;
}

function renderGroups(groups) {
  topicGroups.replaceChildren();
  for (const group of groups) {
    const section = element('section', 'topic-group');
    const head = element('div', 'topic-group-head');
    head.append(element('h3', '', group.title), element('p', '', group.intro));
    const list = element('div', 'topic-grid');
    for (const topic of topics.filter(item => item.group === group.id && item.count > 0)) {
      const card = element('button', 'topic-card');
      card.type = 'button';
      card.append(element('strong', '', topic.title), element('span', '', `${topic.count} Öle mit Buchbeleg →`));
      card.addEventListener('click', () => { location.hash = `thema/${topic.id}`; });
      list.append(card);
    }
    section.append(head, list);
    topicGroups.append(section);
  }
}

function render() {
  const query = normalized(search.value.trim());
  const visible = oils.filter(oil =>
    (!activeTopic || oil.topicMatches.some(item => item.topic === activeTopic)) &&
    (activeFilter === 'Alle' || oil.type === activeFilter) && oil.searchText.includes(query));
  if (query) visible.sort((a, b) =>
    Number(b.directSearchText.includes(query)) - Number(a.directSearchText.includes(query))
    || a.name.localeCompare(b.name, 'de'));
  grid.replaceChildren(...visible.slice(0, shown).map(renderRow));
  const total = activeTopic ? oils.filter(oil => oil.topicMatches.some(item => item.topic === activeTopic)).length : oils.length;
  count.textContent = `${visible.length} von ${total} Ölen gefunden · ${Math.min(shown, visible.length)} angezeigt`;
  empty.hidden = visible.length !== 0;
  loadMore.hidden = shown >= visible.length;
}

function showRoute() {
  const route = decodeURIComponent(location.hash.slice(1));
  if (!oils.length || (!route.startsWith('thema/') && !route.startsWith('oele') && !route.startsWith('suche/') && !route.startsWith('oel/'))) {
    hero.hidden = false;
    home.hidden = false;
    browse.hidden = true;
    detail.hidden = true;
    activeTopic = null;
    document.title = 'Ölübersicht · Arbeitsfassung';
    window.scrollTo(0, 0);
    return;
  }
  if (route.startsWith('oel/')) {
    const product = oils.find(item => item.id === route.slice(4));
    if (!product) { location.hash = 'oele'; return; }
    hero.hidden = true;
    home.hidden = true;
    browse.hidden = true;
    detail.hidden = false;
    activeTopic = lastListHash.startsWith('#thema/') ? lastListHash.slice(7) : null;
    detailContent.replaceChildren(renderCard(product));
    detail.scrollIntoView();
    document.title = `${displayName(product)} · Ölübersicht`;
    return;
  }
  hero.hidden = true;
  home.hidden = true;
  browse.hidden = false;
  detail.hidden = true;
  activeTopic = route.startsWith('thema/') ? route.slice(6) : null;
  const topic = topics.find(item => item.id === activeTopic);
  if (activeTopic && !topic) { location.hash = 'start'; return; }
  browseTitle.textContent = topic ? topic.title : route.startsWith('suche/') ? 'Suchergebnisse' : route === 'oele/einzel' ? 'Einzelöle' : route === 'oele/mischungen' ? 'Ölmischungen' : 'Alle Öle';
  browseContext.textContent = topic
    ? 'Wähle ein Öl für Beschreibung, Anwendung und den konkreten Buchbeleg zum Thema.'
    : 'Wähle ein Öl, um die vollständigen Buchtexte und Quellen zu öffnen.';
  search.value = restoreListState ? lastListQuery : route.startsWith('suche/') ? route.slice(6) : '';
  activeFilter = restoreListState ? lastListFilter : route === 'oele/einzel' ? 'Einzelöl' : route === 'oele/mischungen' ? 'Mischung' : 'Alle';
  restoreListState = false;
  buttons.forEach(item => item.setAttribute('aria-pressed', String(item.dataset.filter === activeFilter)));
  shown = 40;
  render();
  browse.scrollIntoView();
  document.title = `${browseTitle.textContent} · Ölübersicht`;
}

buttons.forEach(button => button.addEventListener('click', () => {
  activeFilter = button.dataset.filter;
  buttons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  shown = 40;
  render();
}));
search.addEventListener('input', () => { shown = 40; render(); });
loadMore.addEventListener('click', () => { shown += 40; render(); });
document.querySelector('#back-to-topics').addEventListener('click', () => { location.hash = 'start'; });
document.querySelector('#back-to-list').addEventListener('click', () => {
  restoreListState = true;
  location.hash = lastListHash;
});
document.querySelector('#home-search-form').addEventListener('submit', event => {
  event.preventDefault();
  const query = homeSearch.value.trim();
  if (query) location.hash = `suche/${encodeURIComponent(query)}`;
});
window.addEventListener('hashchange', showRoute);

try {
  let catalog;
  let themeData;
  if (protectedData) {
    catalog = protectedData.catalog;
    themeData = protectedData.themes;
    imageById = protectedData.images;
    shopById = protectedData.shop.matched_products;
  } else {
    const [catalogResponse, topicsResponse, imagesResponse, shopResponse] = await Promise.all([
      fetch('oele-aus-buch.json'), fetch('themen-aus-buch.json'), fetch('shop-bilder.json'), fetch('de-shop-abgleich.json'),
    ]);
    if (!catalogResponse.ok || !topicsResponse.ok || !shopResponse.ok) throw new Error(`HTTP ${catalogResponse.status}/${topicsResponse.status}/${shopResponse.status}`);
    [catalog, themeData] = await Promise.all([catalogResponse.json(), topicsResponse.json()]);
    imageById = imagesResponse.ok ? (await imagesResponse.json()).images : {};
    shopById = (await shopResponse.json()).matched_products;
  }
  topics = themeData.topics;
  oils = catalog.products.filter(product => Boolean(shopById[product.id])).map(product => ({
    ...product,
    topicMatches: themeData.assignments[product.id] || [],
    directSearchText: normalized([
      product.name, product.description, product.usage, product.areas, product.caution,
    ].join(' ')),
    searchText: normalized([
      product.name, shopById[product.id]?.name, product.usage, product.areas,
      ...(themeData.assignments[product.id] || []).map(match => topics.find(topic => topic.id === match.topic)?.title),
    ].join(' ')),
  }));
  topics = topics.map(topic => ({...topic, count: oils.filter(oil => oil.topicMatches.some(match => match.topic === topic.id)).length}));
  renderGroups(themeData.groups);
  showRoute();
} catch (error) {
  topicGroups.append(element('p', '', `Buchdaten konnten nicht geladen werden: ${error.message}`));
  count.textContent = `Buchdaten konnten nicht geladen werden: ${error.message}`;
}
