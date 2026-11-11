// Titles are independently curated. Within each topic: familiar, intermediate, advanced.
export const POOL = {
  physics: [
    ['Magnetism', 'Rainbow', 'Gravity', 'Sound', 'Steam'],
    ['Doppler effect', 'Surface tension', 'Refraction', 'Conservation of energy', 'Buoyancy', 'Electromagnetic induction', 'Brownian motion', 'Thermodynamics', 'Photoelectric effect', 'Superconductivity'],
    ['Lagrangian mechanics', 'Bose–Einstein condensate', 'Quantum entanglement', 'Cherenkov radiation', 'Faraday cage'],
  ],
  chemistry: [
    ['Oxygen', 'Gold', 'Rust', 'Helium', 'Carbon dioxide'],
    ['Catalysis', 'Distillation', 'Electrolysis', 'Silicon', 'Tungsten', 'Iodine', 'Polyethylene', 'Alloy', 'Acetic acid', 'Ozone'],
    ['Aromaticity', 'Stoichiometry', 'Enthalpy', 'Coordination complex', 'Stereochemistry'],
  ],
  mathematics: [
    ['Geometry', 'Fraction', 'Prime number', 'Symmetry', 'Decimal'],
    ['Logarithm', 'Fractal', 'Fibonacci sequence', 'Pythagorean theorem', 'Matrix (mathematics)', 'Game theory', 'Set theory', 'Sieve of Eratosthenes', 'Normal distribution', "Euler's identity"],
    ['Eigenvalues and eigenvectors', "Bayes' theorem", 'Graph isomorphism', 'Fourier transform', 'Topology'],
  ],
  nature: [
    ['Octopus', 'Penguin', 'Cactus', 'Jellyfish', 'Bamboo'],
    ['Axolotl', 'Pangolin', 'Sea otter', 'Horseshoe crab', 'Snow leopard', 'Ginkgo biloba', 'Mangrove', 'Venus flytrap', 'Ammonoidea', 'Mycorrhiza'],
    ['Tardigrade', 'Echinoderm', 'Cnidaria', 'Ediacaran biota', 'Cephalopod'],
  ],
  medicine: [
    ['Vaccine', 'Blood', 'Brain', 'Allergy', 'Sleep'],
    ['Antimicrobial resistance', 'Anesthesia', 'Insulin', 'Organ transplantation', 'Hemodialysis', 'Placebo', 'Sickle cell disease', 'Endoscopy', 'Cataract', 'Electrocardiography'],
    ['Hemostasis', 'Apoptosis', 'Acetylcholine', 'Osmoregulation', 'Autophagy'],
  ],
  earth: [
    ['Volcano', 'Earthquake', 'Antarctica', 'Sahara', 'Moon'],
    ['Bering Strait', 'Lake Baikal', 'Atacama Desert', 'Andes', 'Stratosphere', 'El Niño–Southern Oscillation', 'Plate tectonics', 'Kuiper belt', 'Pulsar', 'Continental drift'],
    ['Hadley cell', 'Milankovitch cycles', 'Ophiolite', 'Chandrasekhar limit', 'Paleomagnetism'],
  ],
  history: [
    ['Silk Road', 'French Revolution', 'Roman Empire', 'Industrial Revolution', 'Cold War'],
    ['Haitian Revolution', 'Meiji Restoration', "Thirty Years' War", 'Late Bronze Age collapse', 'Treaty of Versailles', 'Mali Empire', 'Berlin Blockade', 'Boxer Rebellion', 'Fall of Constantinople', 'Mughal Empire'],
    ['Peace of Westphalia', 'Taiping Rebellion', 'War of the Spanish Succession', 'Wars of the Roses', 'Battle of Lepanto'],
  ],
  people: [
    ['Marie Curie', 'Isaac Newton', 'Frida Kahlo', 'Nelson Mandela', 'Charles Darwin'],
    ['Ada Lovelace', 'Ibn Battuta', 'Hannah Arendt', 'Hokusai', 'Florence Nightingale', 'Rachel Carson', 'Srinivasa Ramanujan', 'James Baldwin', 'Johannes Gutenberg', 'Murasaki Shikibu'],
    ['Al-Biruni', 'Émilie du Châtelet', 'Mary Anning', 'W. E. B. Du Bois', 'Sofya Kovalevskaya'],
  ],
  technology: [
    ['Bicycle', 'Microscope', 'Steam engine', 'Compass', 'Printing press'],
    ['Gyroscope', 'Fiber-optic communication', 'Sextant', 'Sonar', 'Transistor', 'Internal combustion engine', 'Telegraphy', 'Barometer', 'Lithium-ion battery', "Archimedes' screw"],
    ['Interferometry', 'Stirling engine', 'Cathode ray tube', 'Phase-locked loop', 'Photolithography'],
  ],
  culture: [
    ['Ballet', 'Jazz', 'Origami', 'Mosaic', 'Opera'],
    ['Bauhaus', 'Woodcut', 'Impressionism', 'Haiku', 'Sitar', 'Fresco', 'Magical realism', 'Gamelan', 'Gothic architecture', 'Film noir'],
    ['Chiaroscuro', 'Counterpoint', 'Ekphrasis', 'Pointillism', 'Dada'],
  ],
  society: [
    ['Democracy', 'Inflation', 'Marriage', 'Buddhism', 'Myth'],
    ['Monasticism', 'Zoroastrianism', 'Sufism', 'Federalism', 'Social contract', 'Go (game)', 'Fencing', 'Fermentation', 'Quarantine', 'Cognitive dissonance'],
    ['Mercantilism', 'Animism', 'Utilitarianism', 'Collective bargaining', 'Comparative advantage'],
  ],
};

export function titleKey(title){
  return title.normalize('NFKC').replace(/[‘’]/g,"'").replace(/_/g,' ').trim().toLowerCase();
}

export function candidateOrder(history, random=Math.random){
  const keys=[...new Set(history.map(titleKey))];
  const recentTopics=new Set(keys.slice(0,2).map(key=>topicByTitle.get(key)));
  const ranked=[];
  for(const [topic,tiers] of Object.entries(POOL)){
    for(const [tier,titles] of tiers.entries()){
      for(const title of titles){
        const position=keys.indexOf(titleKey(title));
        // Exponential draws give each candidate a probability proportional to its weight.
        const weight=[2,4,1][tier]*(recentTopics.has(topic)?0.15:1);
        ranked.push({title,position,rank:-Math.log(1-random())/weight});
      }
    }
  }
  // Unplayed pages first, then least recently played if the available pool is exhausted.
  return ranked.sort((a,b)=>{
    if(a.position===b.position)return a.rank-b.rank;
    if(a.position===-1)return -1;
    if(b.position===-1)return 1;
    return b.position-a.position;
  }).map(entry=>entry.title);
}

const topicByTitle=new Map(Object.entries(POOL).flatMap(([topic,tiers])=>
  tiers.flat().map(title=>[titleKey(title),topic])));
