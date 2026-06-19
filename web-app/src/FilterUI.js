// FilterUI — builds the filter (and rotor) controls from the taxonomy, so the
// list comes from taxonomy.json instead of ~1100 lines of hand-maintained,
// duplicated HTML. One collapsible group per filterGroup; each leaf is a
// checkbox whose id is `<prefix>-<feature id>` (FilterManager / Accessibility
// Manager wire to those; accordion toggling is handled by app.js's existing
// `.filter-accordion-header` listener).

export function buildFilterUI(taxonomy, container, prefix = 'filter') {
  if (!container) return;
  container.textContent = '';

  const groups = taxonomy.byFilterGroup();
  for (const groupName of Object.keys(groups).sort()) {
    const features = groups[groupName];
    const contentId = `${prefix}-fg-` + groupName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const item = document.createElement('div');
    item.className = 'filter-accordion-item';

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'filter-accordion-header';
    header.setAttribute('aria-expanded', 'false');
    header.setAttribute('aria-controls', contentId);
    const labelSpan = document.createElement('span');
    labelSpan.className = 'label';
    labelSpan.textContent = groupName;
    const arrow = document.createElement('span');
    arrow.className = 'accordion-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '▼';
    header.append(labelSpan, arrow);

    const content = document.createElement('div');
    content.id = contentId;
    content.className = 'filter-accordion-content';
    content.hidden = true;

    for (const feature of features) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.id = prefix + '-' + feature.id;
      label.append(input, document.createTextNode(' ' + (feature.label || feature.id)));
      content.append(label);
    }

    item.append(header, content);
    container.append(item);
  }
}
