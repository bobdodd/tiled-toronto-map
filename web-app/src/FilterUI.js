// FilterUI — builds the filter (and rotor) controls from the taxonomy, so the
// list comes from taxonomy.json instead of ~1100 lines of hand-maintained,
// duplicated HTML. Two levels: one collapsible SECTION per ui.section (the
// flat 31-group list had become unmanageable), and inside it a fieldset per
// ui.filterGroup — native grouping a screen reader announces and skims by,
// without a second level of disclosure to operate. Each leaf is a checkbox
// whose id is `<prefix>-<feature id>` (FilterManager / AccessibilityManager
// wire to those; accordion toggling is handled by app.js's existing
// `.filter-accordion-header` listener).

// Section order is POLICY, kept in one place. Accessibility leads for now;
// to go alphabetical, replace the array with [] and the sort fallback below
// carries the whole list. Sections missing from taxonomy.json are skipped,
// unknown ones append alphabetically — the UI never loses features over a
// vocabulary drift.
const SECTION_ORDER = [
  'Accessibility',
  'Getting around',
  'Emergency & health',
  'Everyday places',
  'Culture & recreation',
  'Nature & water',
  'Built environment',
  'Airport & terminal',
];

export function buildFilterUI(taxonomy, container, prefix = 'filter', baseTabIndex = 0) {
  if (!container) return;
  container.textContent = '';

  // Positive tabindex keeps this control band ahead of the map features (which
  // the rotor authors at 9000+). When baseTabIndex is given, each section header
  // and checkbox gets an incrementing value from it, in document order.
  let tabIndex = baseTabIndex;

  const sections = taxonomy.bySection();
  const names = [
    ...SECTION_ORDER.filter((n) => sections[n]),
    ...Object.keys(sections).filter((n) => !SECTION_ORDER.includes(n)).sort(),
  ];

  for (const sectionName of names) {
    const subgroups = sections[sectionName];
    const contentId = `${prefix}-fg-` + sectionName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const item = document.createElement('div');
    item.className = 'filter-accordion-item';

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'filter-accordion-header';
    header.setAttribute('aria-expanded', 'false');
    header.setAttribute('aria-controls', contentId);
    if (baseTabIndex) header.tabIndex = tabIndex++;
    const labelSpan = document.createElement('span');
    labelSpan.className = 'label';
    labelSpan.textContent = sectionName;
    const arrow = document.createElement('span');
    arrow.className = 'accordion-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '▼';
    header.append(labelSpan, arrow);

    const content = document.createElement('div');
    content.id = contentId;
    content.className = 'filter-accordion-content';
    content.hidden = true;

    const subNames = Object.keys(subgroups);
    for (const subName of subNames) {
      // A lone subgroup that just repeats the section name would be a
      // redundant announcement — render its checkboxes flat.
      let host = content;
      if (!(subNames.length === 1 && subName === sectionName)) {
        const fs = document.createElement('fieldset');
        fs.className = 'filter-subgroup';
        const legend = document.createElement('legend');
        legend.textContent = subName;
        fs.append(legend);
        content.append(fs);
        host = fs;
      }
      for (const feature of subgroups[subName]) {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = prefix + '-' + feature.id;
        if (baseTabIndex) input.tabIndex = tabIndex++;
        label.append(input, document.createTextNode(' ' + (feature.label || feature.id)));
        host.append(label);
      }
    }

    item.append(header, content);
    container.append(item);
  }
}
