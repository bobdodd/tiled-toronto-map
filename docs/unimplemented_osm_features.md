# Unimplemented OSM Features

## Currently Implemented
- **Buildings** - Basic building polygons with labels
- **Roads/Highways** - Primary, secondary, tertiary, residential, service, footway, pedestrian
- **Transit Stops** - Bus stops, tram stops, train stations, subway entrances
- **Shops** - All shop types (points and polygons)
- **Schools** - Educational amenities (points and polygons)
- **Places of Worship** - Religious amenities (points and polygons)
- **Parks & Recreation** - Parks, playgrounds, gardens, sports centers, pitches
- **Addresses** - Address points with house numbers

## Major Unimplemented Categories

### 1. Healthcare Features
- **Amenity=hospital** - Hospitals
- **Amenity=clinic** - Medical clinics
- **Amenity=doctors** - Doctor offices
- **Amenity=dentist** - Dental practices
- **Amenity=pharmacy** - Pharmacies
- **Amenity=veterinary** - Veterinary clinics
- **Healthcare=*** - Specialized healthcare facilities

### 2. Transportation Infrastructure
- **Railway=rail** - Railway tracks
- **Railway=subway** - Subway/metro lines
- **Railway=tram** - Tram lines
- **Highway=motorway** - Motorways/freeways (partially implemented)
- **Highway=trunk** - Trunk roads (partially implemented)
- **Aeroway=runway** - Airport runways
- **Aeroway=taxiway** - Airport taxiways
- **Aeroway=terminal** - Airport terminals
- **Public_transport=platform** - Transit platforms

### 3. Financial Services
- **Amenity=bank** - Banks
- **Amenity=atm** - ATMs
- **Amenity=post_office** - Post offices
- **Amenity=bureau_de_change** - Currency exchange

### 4. Sustenance & Food
- **Amenity=restaurant** - Restaurants
- **Amenity=cafe** - Cafes
- **Amenity=fast_food** - Fast food
- **Amenity=bar** - Bars
- **Amenity=pub** - Pubs
- **Amenity=food_court** - Food courts

### 5. Accommodation & Tourism
- **Tourism=hotel** - Hotels
- **Tourism=hostel** - Hostels
- **Tourism=guest_house** - Guest houses
- **Tourism=camp_site** - Campsites
- **Tourism=attraction** - Tourist attractions
- **Tourism=museum** - Museums
- **Tourism=gallery** - Art galleries
- **Tourism=viewpoint** - Scenic viewpoints
- **Tourism=information** - Tourist information

### 6. Entertainment & Culture
- **Amenity=cinema** - Movie theaters
- **Amenity=theatre** - Theaters
- **Amenity=library** - Libraries
- **Amenity=community_centre** - Community centers
- **Amenity=arts_centre** - Arts centers
- **Leisure=sports_centre** - Sports centers (basic implementation exists)
- **Leisure=swimming_pool** - Swimming pools
- **Leisure=golf_course** - Golf courses
- **Leisure=stadium** - Stadiums

### 7. Emergency Services
- **Amenity=police** - Police stations
- **Amenity=fire_station** - Fire stations
- **Emergency=phone** - Emergency phones
- **Emergency=defibrillator** - Public defibrillators

### 8. Natural Features
- **Natural=water** - Water bodies
- **Natural=forest** - Forests
- **Natural=wood** - Woods
- **Natural=grassland** - Grasslands
- **Natural=beach** - Beaches
- **Natural=cliff** - Cliffs
- **Natural=peak** - Mountain peaks
- **Natural=tree** - Individual trees

### 9. Landuse
- **Landuse=residential** - Residential areas
- **Landuse=commercial** - Commercial areas
- **Landuse=industrial** - Industrial areas
- **Landuse=retail** - Retail areas
- **Landuse=farmland** - Agricultural land
- **Landuse=forest** - Forested areas
- **Landuse=cemetery** - Cemeteries

### 10. Waterways
- **Waterway=river** - Rivers
- **Waterway=stream** - Streams
- **Waterway=canal** - Canals
- **Waterway=ditch** - Ditches
- **Natural=coastline** - Coastlines

### 11. Power Infrastructure
- **Power=line** - Power lines
- **Power=pole** - Power poles
- **Power=tower** - Power towers
- **Power=substation** - Electrical substations
- **Power=generator** - Power generators

### 12. Man-made Structures
- **Man_made=bridge** - Bridges
- **Man_made=tunnel** - Tunnels
- **Man_made=tower** - Towers
- **Man_made=mast** - Masts/antennas
- **Man_made=pier** - Piers
- **Man_made=breakwater** - Breakwaters

### 13. Barriers
- **Barrier=fence** - Fences
- **Barrier=wall** - Walls
- **Barrier=hedge** - Hedges
- **Barrier=gate** - Gates
- **Barrier=bollard** - Bollards

### 14. Historic Features
- **Historic=monument** - Monuments
- **Historic=memorial** - Memorials
- **Historic=archaeological_site** - Archaeological sites
- **Historic=castle** - Castles
- **Historic=ruins** - Historic ruins

### 15. Office Types
- **Office=company** - Company offices
- **Office=government** - Government offices
- **Office=lawyer** - Law offices
- **Office=estate_agent** - Real estate offices
- **Office=insurance** - Insurance offices

### 16. Craft & Industrial
- **Craft=brewery** - Breweries
- **Craft=carpenter** - Carpentry shops
- **Craft=electrician** - Electrical services
- **Craft=plumber** - Plumbing services

### 17. Communication
- **Amenity=post_box** - Post boxes
- **Amenity=telephone** - Public phones
- **Telecom=data_center** - Data centers

### 18. Waste Management
- **Amenity=waste_basket** - Trash bins
- **Amenity=recycling** - Recycling centers
- **Amenity=waste_disposal** - Waste disposal

### 19. Public Facilities
- **Amenity=toilets** - Public restrooms
- **Amenity=shower** - Public showers
- **Amenity=drinking_water** - Drinking water fountains
- **Amenity=bench** - Public benches
- **Amenity=shelter** - Shelters

### 20. Boundaries
- **Boundary=administrative** - Administrative boundaries
- **Boundary=national_park** - National park boundaries
- **Boundary=postal_code** - Postal code boundaries

## Implementation Priority Suggestions

### High Priority (Most Useful for Accessibility)
1. Healthcare facilities (hospitals, clinics, pharmacies)
2. Public facilities (toilets, drinking water, benches)
3. Food & sustenance (restaurants, cafes)
4. Financial services (banks, ATMs)
5. Emergency services (police, fire stations)

### Medium Priority
1. Tourism & accommodation
2. Entertainment & culture
3. Natural features (water bodies, parks)
4. Transportation infrastructure improvements
5. Landuse areas

### Lower Priority
1. Power infrastructure
2. Communication facilities
3. Craft & industrial
4. Historic features
5. Boundaries

## Technical Notes
- Many features can be implemented as both points and polygons
- Consider accessibility information (wheelchair access, audio signals, etc.)
- Some features may need specialized rendering (symbols, icons)
- Performance impact should be considered for dense feature sets
- Filter controls will need expansion for new categories