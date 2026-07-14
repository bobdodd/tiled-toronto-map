// TaxonomyClient — loads taxonomy.json (the single source of truth for the map
// feature taxonomy) and derives the web app's filter/rotor model from it,
// replacing the former hard-coded classMap and the duplicated filter/rotor HTML.
//
// Each category declares a `layer`: 'base' features hide/show; 'poi' and
// 'accessibility' features are overlays — they highlight and feed the rotor for
// keyboard navigation, but never hide (the attribute rides on a base feature
// that must stay).

export class TaxonomyClient {
  constructor(data) {
    this.categories = data.categories || {};
    this.features = data.features || [];
  }

  static async load(url = 'taxonomy.json') {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`taxonomy.json: HTTP ${response.status}`);
    return new TaxonomyClient(await response.json());
  }

  layerOf(feature) {
    return (this.categories[feature.category] || {}).layer || 'base';
  }

  // The CSS class that matches this feature on a tile. A fixed subtype targets
  // the specific class (.amenity-restaurant); a variable subtype (subtypeFrom)
  // targets the whole category (.building catches every building).
  classFor(feature) {
    return feature.subtype != null
      ? `${feature.category}-${feature.subtype}`
      : feature.category;
  }

  selectorFor(feature) {
    return '.' + this.classFor(feature);
  }

  getById(id) {
    return this.features.find((f) => f.id === id) || null;
  }

  // Base-category features → hide/show filters.
  baseFeatures() {
    return this.features.filter((f) => this.layerOf(f) === 'base');
  }

  // POI + accessibility features → highlight / rotor-navigate filters.
  overlayFeatures() {
    return this.features.filter((f) => this.layerOf(f) !== 'base');
  }

  // Features grouped by their UI filter group, for building the controls.
  byFilterGroup() {
    const groups = {};
    for (const f of this.features) {
      const group = (f.ui && f.ui.filterGroup) || 'Other';
      (groups[group] = groups[group] || []).push(f);
    }
    return groups;
  }

  // The two-level filter/rotor model: section (accordion) -> subgroup
  // (fieldset) -> features. Insertion order follows taxonomy list order;
  // the SECTION order policy lives in FilterUI.
  bySection() {
    const sections = {};
    for (const f of this.features) {
      const ui = f.ui || {};
      const section = ui.section || 'Other';
      const sub = ui.filterGroup || 'Other';
      const s = (sections[section] = sections[section] || {});
      (s[sub] = s[sub] || []).push(f);
    }
    return sections;
  }
}
