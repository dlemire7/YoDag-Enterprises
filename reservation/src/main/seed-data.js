const RESTAURANTS = [
  // === 3-Star Michelin (5) ===
  { name: 'Le Bernardin', neighborhood: 'Midtown West', borough: 'Manhattan', cuisine: 'French / Seafood', stars: 3, criteria: '["michelin"]', platform: 'Resy', reservation_release: '30 days ahead', url: 'https://resy.com/cities/ny/le-bernardin' },
  { name: 'Eleven Madison Park', neighborhood: 'Flatiron', borough: 'Manhattan', cuisine: 'Contemporary American', stars: 3, criteria: '["michelin"]', platform: 'Resy', reservation_release: '28 days ahead', url: 'https://resy.com/cities/ny/eleven-madison-park' },
  { name: 'Masa', neighborhood: 'Midtown West', borough: 'Manhattan', cuisine: 'Japanese / Sushi', stars: 3, criteria: '["michelin"]', platform: 'Tock', reservation_release: 'First of month', url: 'https://www.exploretock.com/masa' },
  { name: 'Per Se', neighborhood: 'Columbus Circle', borough: 'Manhattan', cuisine: 'French / American', stars: 3, criteria: '["michelin"]', platform: 'Resy', reservation_release: '28 days ahead', url: 'https://resy.com/cities/ny/per-se' },
  { name: "Chef's Table at Brooklyn Fare", neighborhood: 'Downtown Brooklyn', borough: 'Brooklyn', cuisine: 'French / Contemporary', stars: 3, criteria: '["michelin"]', platform: 'Tock', reservation_release: '6 weeks ahead', url: 'https://www.exploretock.com/chefstable' },

  // === 2-Star Michelin (14) ===
  { name: 'Aquavit', neighborhood: 'Midtown East', borough: 'Manhattan', cuisine: 'Scandinavian', stars: 2, criteria: '["michelin"]', platform: 'Resy', reservation_release: '30 days ahead', url: 'https://resy.com/cities/ny/aquavit' },
  { name: 'Aska', neighborhood: 'Williamsburg', borough: 'Brooklyn', cuisine: 'Scandinavian', stars: 2, criteria: '["michelin"]', platform: 'Tock', reservation_release: 'Monthly drop', url: 'https://www.exploretock.com/aska' },
  { name: 'Atera', neighborhood: 'TriBeCa', borough: 'Manhattan', cuisine: 'Contemporary American', stars: 2, criteria: '["michelin"]', platform: 'Tock', reservation_release: 'Monthly drop', url: 'https://www.exploretock.com/atera' },
  { name: 'Atomix', neighborhood: 'Midtown East', borough: 'Manhattan', cuisine: 'Korean', stars: 2, criteria: '["michelin"]', platform: 'Tock', reservation_release: 'Monthly drop', url: 'https://www.exploretock.com/atomix' },
  { name: 'Daniel', neighborhood: 'Upper East Side', borough: 'Manhattan', cuisine: 'French', stars: 2, criteria: '["michelin"]', platform: 'Resy', reservation_release: '28 days ahead', url: 'https://resy.com/cities/ny/daniel' },
  { name: 'Jungsik', neighborhood: 'TriBeCa', borough: 'Manhattan', cuisine: 'Korean', stars: 2, criteria: '["michelin"]', platform: 'Resy', reservation_release: '30 days ahead', url: 'https://resy.com/cities/ny/jungsik' },
  { name: 'The Modern', neighborhood: 'Midtown West', borough: 'Manhattan', cuisine: 'American / French', stars: 2, criteria: '["michelin"]', platform: 'Resy', reservation_release: '30 days ahead', url: 'https://resy.com/cities/ny/the-modern' },
  { name: 'Saga', neighborhood: 'Financial District', borough: 'Manhattan', cuisine: 'New American', stars: 2, criteria: '["michelin"]', platform: 'Tock', reservation_release: '28 days ahead', url: 'https://www.exploretock.com/saga' },
  { name: 'Sushi Nakazawa', neighborhood: 'West Village', borough: 'Manhattan', cuisine: 'Japanese / Sushi', stars: 2, criteria: '["michelin"]', platform: 'Resy', reservation_release: '30 days ahead', url: 'https://resy.com/cities/ny/sushi-nakazawa' },
  { name: 'Tempura Matsui', neighborhood: 'Midtown East', borough: 'Manhattan', cuisine: 'Japanese', stars: 2, criteria: '["michelin"]', platform: 'OpenTable', reservation_release: '30 days ahead', url: 'https://www.opentable.com/tempura-matsui' },
  { name: 'Francie', neighborhood: 'Williamsburg', borough: 'Brooklyn', cuisine: 'French / American', stars: 2, criteria: '["michelin"]', platform: 'Resy', reservation_release: '30 days ahead', url: 'https://resy.com/cities/ny/francie' },
  { name: 'Blue Hill', neighborhood: 'Greenwich Village', borough: 'Manhattan', cuisine: 'Farm-to-Table', stars: 2, criteria: '["michelin"]', platform: 'Resy', reservation_release: '28 days ahead', url: 'https://resy.com/cities/ny/blue-hill' },
  { name: 'Odo', neighborhood: 'Flatiron', borough: 'Manhattan', cuisine: 'Japanese / Kaiseki', stars: 2, criteria: '["michelin"]', platform: 'Tock', reservation_release: 'Monthly drop', url: 'https://www.exploretock.com/odo' },
  { name: 'Icca', neighborhood: 'Lower East Side', borough: 'Manhattan', cuisine: 'Japanese / Omakase', stars: 2, criteria: '["michelin"]', platform: 'Tock', reservation_release: 'Monthly drop', url: 'https://www.exploretock.com/icca' },

  // === 1-Star Michelin (33) ===
  { name: 'Ai Fiori', neighborhood: 'Midtown West', borough: 'Manhattan', cuisine: 'Italian / French', stars: 1, criteria: '["michelin"]', platform: 'OpenTable', reservation_release: '30 days ahead', url: 'https://www.opentable.com/ai-fiori' },
  { name: 'Aldea', neighborhood: 'Flatiron', borough: 'Manhattan', cuisine: 'Mediterranean', stars: 1, criteria: '["michelin"]', platform: 'Resy', reservation_release: '30 days ahead', url: 'https://resy.com/cities/ny/aldea' },
  { name: 'Benno', neighborhood: 'Midtown East', borough: 'Manhattan', cuisine: 'Italian', stars: 1, criteria: '["michelin"]', platform: 'Resy', reservation_release: '30 days ahead', url: 'https://resy.com/cities/ny/benno' },
  { name: 'Claro', neighborhood: 'Gowanus', borough: 'Brooklyn', cuisine: 'Mexican', stars: 1, criteria: '["michelin"]', platform: 'Resy', reservation_release: '14 days ahead', url: 'https://resy.com/cities/ny/claro' },
  { name: 'Cote', neighborhood: 'Flatiron', borough: 'Manhattan', cuisine: 'Korean Steakhouse', stars: 1, criteria: '["michelin"]', platform: 'Resy', reservation_release: '30 days ahead', url: 'https://resy.com/cities/ny/cote' },
  { name: 'Crown Shy', neighborhood: 'Financial District', borough: 'Manhattan', cuisine: 'New American', stars: 1, criteria: '["michelin"]', platform: 'Resy', reservation_release: '14 days ahead', url: 'https://resy.com/cities/ny/crown-shy' },
  { name: 'Don Angie', neighborhood: 'West Village', borough: 'Manhattan', cuisine: 'Italian', stars: 1, criteria: '["michelin"]', platform: 'Resy', reservation_release: '14 days ahead', url: 'https://resy.com/cities/ny/don-angie' },
  { name: 'Estela', neighborhood: 'Nolita', borough: 'Manhattan', cuisine: 'Mediterranean', stars: 1, criteria: '["michelin"]', platform: 'Resy', reservation_release: '30 days ahead', url: 'https://resy.com/cities/ny/estela' },
  { name: 'Gramercy Tavern', neighborhood: 'Flatiron', borough: 'Manhattan', cuisine: 'American', stars: 1, criteria: '["michelin"]', platform: 'OpenTable', reservation_release: '28 days ahead', url: 'https://www.opentable.com/gramercy-tavern' },
  { name: "L'Artusi", neighborhood: 'West Village', borough: 'Manhattan', cuisine: 'Italian', stars: 1, criteria: '["michelin"]', platform: 'Resy', reservation_release: '30 days ahead', url: 'https://resy.com/cities/ny/lartusi' },
  { name: 'Le Coucou', neighborhood: 'SoHo', borough: 'Manhattan', cuisine: 'French', stars: 1, criteria: '["michelin"]', platform: 'Resy', reservation_release: '30 days ahead', url: 'https://resy.com/cities/ny/le-coucou' },
  { name: 'Le Pavillon', neighborhood: 'Midtown East', borough: 'Manhattan', cuisine: 'French / Seafood', stars: 1, criteria: '["michelin"]', platform: 'Resy', reservation_release: '28 days ahead', url: 'https://resy.com/cities/ny/le-pavillon' },
  { name: 'The Musket Room', neighborhood: 'Nolita', borough: 'Manhattan', cuisine: 'New American', stars: 1, criteria: '["michelin"]', platform: 'Resy', reservation_release: '30 days ahead', url: 'https://resy.com/cities/ny/the-musket-room' },
  { name: 'Mise en Place', neighborhood: 'Williamsburg', borough: 'Brooklyn', cuisine: 'Contemporary American', stars: 1, criteria: '["michelin"]', platform: 'Resy', reservation_release: '30 days ahead', url: 'https://resy.com/cities/ny/mise-en-place' },
  { name: 'Noz', neighborhood: 'Midtown East', borough: 'Manhattan', cuisine: 'Japanese / Omakase', stars: 1, criteria: '["michelin"]', platform: 'Tock', reservation_release: 'Monthly drop', url: 'https://www.exploretock.com/noz' },
  { name: 'Oxalis', neighborhood: 'Prospect Heights', borough: 'Brooklyn', cuisine: 'Contemporary American', stars: 1, criteria: '["michelin"]', platform: 'Tock', reservation_release: 'Monthly drop', url: 'https://www.exploretock.com/oxalis' },
  { name: 'Peter Luger', neighborhood: 'Williamsburg', borough: 'Brooklyn', cuisine: 'Steakhouse', stars: 1, criteria: '["michelin"]', platform: 'OpenTable', reservation_release: '30 days ahead', url: 'https://www.opentable.com/peter-luger-steak-house' },
  { name: "Rezdôra", neighborhood: 'Flatiron', borough: 'Manhattan', cuisine: 'Italian / Emilian', stars: 1, criteria: '["michelin"]', platform: 'Resy', reservation_release: '14 days ahead', url: 'https://resy.com/cities/ny/rezdora' },
  { name: 'Sushi Amane', neighborhood: 'Midtown East', borough: 'Manhattan', cuisine: 'Japanese / Omakase', stars: 1, criteria: '["michelin"]', platform: 'Tock', reservation_release: 'Monthly drop', url: 'https://www.exploretock.com/sushi-amane' },
  { name: 'Sushi Ginza Onodera', neighborhood: 'Midtown East', borough: 'Manhattan', cuisine: 'Japanese / Sushi', stars: 1, criteria: '["michelin"]', platform: 'Tock', reservation_release: '30 days ahead', url: 'https://www.exploretock.com/sushi-ginza-onodera' },
  { name: 'Tuome', neighborhood: 'East Village', borough: 'Manhattan', cuisine: 'Asian American', stars: 1, criteria: '["michelin"]', platform: 'Resy', reservation_release: '14 days ahead', url: 'https://resy.com/cities/ny/tuome' },
  { name: 'Via Carota', neighborhood: 'West Village', borough: 'Manhattan', cuisine: 'Italian', stars: 1, criteria: '["michelin"]', platform: 'Resy', reservation_release: '14 days ahead', url: 'https://resy.com/cities/ny/via-carota' },
  { name: "ZZ's Clam Bar", neighborhood: 'West Village', borough: 'Manhattan', cuisine: 'Seafood', stars: 1, criteria: '["michelin"]', platform: 'Resy', reservation_release: '30 days ahead', url: 'https://resy.com/cities/ny/zzs-clam-bar' },
  { name: 'Yoshino', neighborhood: 'Midtown East', borough: 'Manhattan', cuisine: 'Japanese / Edomae Sushi', stars: 1, criteria: '["michelin"]', platform: 'Tock', reservation_release: 'Monthly drop', url: 'https://www.exploretock.com/yoshino' },
  { name: 'Shion 69 Leonard St', neighborhood: 'TriBeCa', borough: 'Manhattan', cuisine: 'Japanese / Omakase', stars: 1, criteria: '["michelin"]', platform: 'Tock', reservation_release: 'Monthly drop', url: 'https://www.exploretock.com/shion' },
  { name: 'Frevo', neighborhood: 'TriBeCa', borough: 'Manhattan', cuisine: 'French', stars: 1, criteria: '["michelin"]', platform: 'Tock', reservation_release: 'Monthly drop', url: 'https://www.exploretock.com/frevo' },
  { name: 'Koloman', neighborhood: 'Flatiron', borough: 'Manhattan', cuisine: 'Austrian', stars: 1, criteria: '["michelin"]', platform: 'Resy', reservation_release: '30 days ahead', url: 'https://resy.com/cities/ny/koloman' },
  { name: "Bâtard", neighborhood: 'TriBeCa', borough: 'Manhattan', cuisine: 'Contemporary European', stars: 1, criteria: '["michelin"]', platform: 'Resy', reservation_release: '30 days ahead', url: 'https://resy.com/cities/ny/batard' },
  { name: 'Café Boulud', neighborhood: 'Upper East Side', borough: 'Manhattan', cuisine: 'French', stars: 1, criteria: '["michelin"]', platform: 'Resy', reservation_release: '28 days ahead', url: 'https://resy.com/cities/ny/cafe-boulud' },
  { name: 'Mari', neighborhood: 'Cobble Hill', borough: 'Brooklyn', cuisine: 'Italian', stars: 1, criteria: '["michelin"]', platform: 'Resy', reservation_release: '14 days ahead', url: 'https://resy.com/cities/ny/mari' },
  { name: 'Hemlock', neighborhood: 'Fort Greene', borough: 'Brooklyn', cuisine: 'New American', stars: 1, criteria: '["michelin"]', platform: 'Resy', reservation_release: '30 days ahead', url: 'https://resy.com/cities/ny/hemlock' },
  { name: 'Foram', neighborhood: 'Flatiron', borough: 'Manhattan', cuisine: 'Indian', stars: 1, criteria: '["michelin"]', platform: 'Resy', reservation_release: '30 days ahead', url: 'https://resy.com/cities/ny/foram' },
  { name: '63 Clinton', neighborhood: 'Lower East Side', borough: 'Manhattan', cuisine: 'American', stars: 1, criteria: '["michelin"]', platform: 'Resy', reservation_release: '14 days ahead', url: 'https://resy.com/cities/ny/63-clinton' },

  // === Non-Starred Elite (8) ===
  { name: 'Tatiana', neighborhood: 'Lincoln Center', borough: 'Manhattan', cuisine: 'Caribbean / American', stars: 0, criteria: '["google","eater"]', platform: 'Resy', reservation_release: '14 days ahead', url: 'https://resy.com/cities/ny/tatiana' },
  { name: 'Dhamaka', neighborhood: 'Lower East Side', borough: 'Manhattan', cuisine: 'Indian', stars: 0, criteria: '["google","eater"]', platform: 'Resy', reservation_release: '14 days ahead', url: 'https://resy.com/cities/ny/dhamaka' },
  { name: 'Lilia', neighborhood: 'Williamsburg', borough: 'Brooklyn', cuisine: 'Italian', stars: 0, criteria: '["eater"]', platform: 'Resy', reservation_release: '14 days ahead', url: 'https://resy.com/cities/ny/lilia' },
  { name: 'Lucali', neighborhood: 'Carroll Gardens', borough: 'Brooklyn', cuisine: 'Pizza', stars: 0, criteria: '["google"]', platform: 'OpenTable', reservation_release: 'Walk-in only', url: 'https://www.opentable.com/lucali' },
  { name: '4 Charles Prime Rib', neighborhood: 'West Village', borough: 'Manhattan', cuisine: 'Steakhouse', stars: 0, criteria: '["google","eater"]', platform: 'Resy', reservation_release: '30 days ahead', url: 'https://resy.com/cities/ny/4-charles-prime-rib' },
  { name: 'Laser Wolf', neighborhood: 'Williamsburg', borough: 'Brooklyn', cuisine: 'Israeli', stars: 0, criteria: '["eater"]', platform: 'Resy', reservation_release: '14 days ahead', url: 'https://resy.com/cities/ny/laser-wolf' },
  { name: 'Double Chicken Please', neighborhood: 'Lower East Side', borough: 'Manhattan', cuisine: 'Bar / Asian Fusion', stars: 0, criteria: '["google"]', platform: 'Resy', reservation_release: '7 days ahead', url: 'https://resy.com/cities/ny/double-chicken-please' },
  { name: "Hart's", neighborhood: 'Bed-Stuy', borough: 'Brooklyn', cuisine: 'American / Seasonal', stars: 0, criteria: '["eater"]', platform: 'Resy', reservation_release: '14 days ahead', url: 'https://resy.com/cities/ny/harts' }
]

export function seedRestaurants(db) {
  const count = db.prepare('SELECT COUNT(*) as count FROM restaurants').get().count
  if (count > 0) return

  const insert = db.prepare(`
    INSERT INTO restaurants (name, neighborhood, borough, cuisine, stars, criteria, platform, reservation_release, url)
    VALUES (@name, @neighborhood, @borough, @cuisine, @stars, @criteria, @platform, @reservation_release, @url)
  `)

  const insertMany = db.transaction((restaurants) => {
    for (const r of restaurants) {
      insert.run(r)
    }
  })

  insertMany(RESTAURANTS)
  console.log(`Seeded ${RESTAURANTS.length} restaurants`)
}

export { RESTAURANTS }
