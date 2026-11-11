/** Offline semantic fallback and ontology augmentation. This is a directed, weighted lexical graph, not a pretrained embedding. */
const GROUPS = [
 'science:mathematics,physics,chemistry,biology,astronomy,geology,medicine,technology',
 'mathematics:algebra,calculus,geometry,statistics,numbers,equation,probability,arithmetic',
 'physics:gravity,energy,motion,electricity,magnetism,mechanics,light,quantum',
 'chemistry:atom,molecule,element,acid,reaction,compound,metal,carbon',
 'biology:life,organism,animal,plant,cell,genetics,evolution,ecology',
 'animal:mammal,bird,reptile,amphibian,fish,insect,arthropod,vertebrate',
 'mammal:human,dog,cat,elephant,horse,whale,bat,primate',
 'insect:mosquito,fly,bee,ant,butterfly,beetle,wasp,moth,dragonfly,termite',
 'mosquito:malaria,larva,bite,blood,parasite,dengue,culicidae,proboscis',
 'fly:flies,wings,flying,flight',
 'bird:eagle,owl,sparrow,parrot,penguin,feather,nest',
 'fish:salmon,shark,trout,tuna,gill',
 'plant:tree,flower,fruit,leaf,grass,forest,seed,root,photosynthesis',
 'tree:oak,pine,willow,bark,wood,branch',
 'nature:environment,biology,land,water,animal,plant,forest,earth,ecology',
 'environment:climate,weather,ecosystem,habitat,pollution,conservation',
 'water:river,ocean,lake,sea,rain,stream,wetland,pond,ice',
 'ocean:marine,coral,reef,deep,fish,whale,sea',
 'river:stream,creek,waterfall,delta,estuary',
 'geography:country,continent,city,land,mountain,river,ocean,desert',
 'earth:planet,world,geology,environment,continent',
 'planet:mars,jupiter,venus,saturn,mercury,neptune,uranus',
 'astronomy:star,planet,galaxy,universe,moon,sun,space',
 'weather:rain,snow,wind,storm,cloud,temperature,humidity',
 'music:musician,song,instrument,orchestra,melody,rhythm,composer,album,genre',
 'instrument:piano,guitar,violin,drum,trumpet,flute,keyboard',
 'genre:jazz,rock,pop,blues,hiphop,reggae,folk,classical',
 'art:painting,sculpture,artist,photography,design,architecture,drawing',
 'literature:book,novel,poem,story,author,writer,poetry,fiction',
 'history:ancient,medieval,empire,war,king,queen,civilization,archaeology',
 'religion:christianity,islam,judaism,hinduism,buddhism,god,church,temple,faith',
 'sport:football,basketball,tennis,cricket,swimming,running,cycling,baseball,soccer,olympics',
 'football:ball,goal,team,player,stadium,league',
 'medicine:doctor,hospital,disease,health,vaccine,virus,bacteria,patient',
 'disease:infection,fever,malaria,cancer,flu,symptom',
 'human:person,people,man,woman,child,body,brain,heart',
 'technology:computer,software,internet,robot,electronics,engineering',
 'computer:processor,memory,algorithm,program,hardware,data',
 'transport:car,train,airplane,ship,bicycle,bus,vehicle',
 'food:fruit,vegetable,bread,cheese,cooking,meat,grain',
 'fruit:apple,banana,orange,pear,grape,berry,mango',
 'language:word,grammar,alphabet,speech,writing,translation',
 'government:politics,law,parliament,president,election,state',
 'economics:money,bank,trade,market,business,finance',
 'architecture:building,house,bridge,temple,castle,tower'
];
const graph = new Map();
function edge(a,b,weight){
  if(!graph.has(a))graph.set(a,new Map());
  graph.get(a).set(b,Math.max(weight,graph.get(a).get(b)||0));
}
for(const record of GROUPS){
  const [parent,childString]=record.split(':');
  for(const child of childString.split(',')){
    edge(parent,child,0.8);edge(child,parent,0.76);
  }
}
// Numeric word equivalents, approximate connections (exact words are handled separately).
for(const [name,num] of [['one','1'],['two','2'],['three','3'],['four','4'],['five','5'],['six','6'],['seven','7'],['eight','8'],['nine','9'],['ten','10']]){
  edge(name,num,0.9);edge(num,name,0.9);
}
/** Avoid transitive false positives through encyclopedic umbrella categories.
 * For example, mathematics -> science -> biology must not be treated as a
 * close relationship, even though both disciplines share the science parent. */
const BROAD_HUBS = new Set('science nature biology geography mathematics physics chemistry music religion sport art medicine technology environment history'.split(' '));
/** Short, weighted lexical paths only: no unrestricted graph diffusion. */
function conceptNeighbors(word){
  const seen=new Map([[word,1]]);
  if(!graph.has(word))return seen;
  let frontier=new Map(seen);
  for(let depth=0;depth<2;depth++){
    const next=new Map();
    for(const [node,weight] of frontier){
      if(depth>0 && BROAD_HUBS.has(node))continue;
      for(const [neighbor,edgeWeight] of graph.get(node)||[]){
        const newWeight=weight*edgeWeight;
        if(newWeight>(seen.get(neighbor)||0) && newWeight>0.2){
          seen.set(neighbor,newWeight);next.set(neighbor,newWeight);
        }
      }
    }
    frontier=next;
  }
  return seen;
}
export function conceptSimilarity(a,b){
  return conceptNeighbors(String(a).toLowerCase()).get(String(b).toLowerCase())??0;
}
export function conceptBatch(guess,targets){
  const neighbors=conceptNeighbors(String(guess).toLowerCase());
  return Object.fromEntries(targets.map(target=>[target,neighbors.get(String(target).toLowerCase())??0]));
}
