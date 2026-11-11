import {normalizeWord,stemWord} from './core.js?v=8';

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
 'plant:tree,flower,fruit,leaf,grass,forest,seed,root,photosynthesis,cactus,succulent,fern,moss,angiosperm',
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
 'moon:satellite,lunar,orbit,earth,gravity,tide,crater,apollo',
 'sun:star,earth,moon,orbit,eclipse,solar,planet',
 'orbit:satellite,gravity,ellipse,rotation,period',
 'geology:lithosphere,crust,mantle,tectonics,continent,earthquake',
 'hormone:insulin,glucose,metabolism,pancreas,blood',
 'wave:frequency,sound,pitch,period,signal,observer',
 'geometry:triangle,angle,hypotenuse,side,square,area',
 'electronics:semiconductor,transistor,voltage,current,amplifier,circuit,signal',
 'fencing:sword,foil,sabre,saber,épée,blade,duel',
 'revolution:france,democracy,monarchy,republic,uprising',
 'federalism:government,state,province,autonomy,federation',
 'design:architecture,craft,school,art,bauhaus,production',
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
const PEER_GROUPS = [
  ['month','january february march april may june july august september october november december'],
  ['weekday','monday tuesday wednesday thursday friday saturday sunday'],
  ['season','spring summer autumn fall winter'],
  ['direction','north east south west northeast southeast southwest northwest'],
  ['duration','second minute hour day week month year decade century millennium'],
  ['color','red orange yellow green blue purple violet pink brown gray grey black white'],
  ['continent','africa antarctica asia europe oceania'],
  ['planet','mercury venus earth mars jupiter saturn uranus neptune'],
];
const graphs={en:new Map(),de:new Map()};
function edge(a,b,weight,language='en'){
  const graph=graphs[language];
  if(!graph.has(a))graph.set(a,new Map());
  graph.get(a).set(b,Math.max(weight,graph.get(a).get(b)||0));
}
for(const record of GROUPS){
  const [parent,childString]=record.split(':');
  for(const child of childString.split(',')){
    edge(parent,child,0.8);edge(child,parent,0.76);
  }
}
for(const [category,members] of PEER_GROUPS){
  for(const member of members.split(' ')){
    edge(category,member,.8);edge(member,category,.68);
  }
}
edge('day','weekday',.76);edge('weekday','day',.76);
edge('calendar','month',.78);edge('month','calendar',.72);
const GERMAN_GROUPS=[
  ['monat','januar februar märz april mai juni juli august september oktober november dezember'],
  ['wochentag','montag dienstag mittwoch donnerstag freitag samstag sonntag'],
  ['jahreszeit','frühling sommer herbst winter'],
  ['richtung','norden osten süden westen nordost südost südwest nordwest'],
  ['zeit','sekunde minute stunde tag woche monat jahr jahrzehnt jahrhundert jahrtausend'],
  ['farbe','rot orange gelb grün blau violett rosa braun grau schwarz weiß'],
  ['kontinent','europa asien afrika antarktika australien amerika'],
  ['planet','merkur venus erde mars jupiter saturn uranus neptun'],
  ['astronomie','himmelskörper weltraum universum stern galaxie planet mond sonne satellit komet umlaufbahn sonnensystem'],
  ['mond','satellit trabant erdmond himmelskörper erde mondoberfläche mondphase krater gezeiten umlaufbahn gravitation'],
  ['sonne','stern erde mond sonnensystem umlaufbahn sonnenlicht sonnenfinsternis planet'],
  ['umlaufbahn','orbit umlauf rotation gravitation ellipse satellit periode'],
  ['geologie','gestein lithosphäre erdkruste erdmantel tektonik kontinent erdbeben'],
  ['hormon','insulin bauchspeicheldrüse stoffwechsel blutzucker glucose glukose proteohormon polypeptidhormon'],
  ['diabetes','insulin blutzucker glucose glukose bauchspeicheldrüse stoffwechsel'],
  ['welle','frequenz schall signal sender empfänger wellenlänge ton bewegung'],
  ['geometrie','dreieck winkel kathete hypotenuse quadrat fläche seite euklid'],
  ['elektronik','halbleiter transistor strom spannung schaltung verstärker signal'],
  ['fechten','sport kampfsport duell schwert säbel degen florett waffe'],
  ['revolution','frankreich republik demokratie monarchie aufklärung menschenrechte aufstand'],
  ['föderalismus','staat bundesland bundesstaat gliedstaat bund autonomie föderation konfederation'],
  ['architektur','bauhaus gotik kirche kathedrale kunst kunstschule handwerk design romanik renaissance'],
  ['krieg','konflikt truppen armee schlacht frieden bündnis territorialkrieg religionskrieg'],
  ['religion','glaube gott kirche buddhismus christentum islam hinduismus lehre'],
  ['amphibie','lurch schwanzlurch frosch salamander molch larve axolotl metamorphose'],
  ['tier','säugetier vogel fisch reptil amphibie insekt'],
  ['säugetier','mensch hund katze pferd wal delfin elefant fledermaus'],
  ['insekt','mücke fliege biene ameise schmetterling käfer wespe libelle'],
  ['vogel','adler eule spatz papagei pinguin feder nest'],
  ['pflanze','baum blume gras moos farn bambus kaktus kakteen kakteengewächse sukkulente bedecktsamer'],
  ['baum','eiche kiefer weide birke buche ahorn wurzel rinde'],
  ['meer','ozean küste insel riff koralle fisch wal'],
  ['gewässer','fluss see teich strom bach meer'],
  ['wetter','regen schnee wind sturm wolke nebel gewitter temperatur'],
  ['gestein','granit basalt kalkstein marmor schiefer sandstein'],
  ['metall','eisen kupfer gold silber zink zinn aluminium stahl'],
  ['sprache','wort satz grammatik schrift dialekt übersetzung'],
  ['musik','instrument lied melodie rhythmus komponist orchester'],
  ['instrument','klavier gitarre geige trompete flöte trommel'],
  ['sport','fußball basketball tennis handball volleyball schwimmen laufen'],
  ['medizin','arzt krankenhaus krankheit impfung therapie operation'],
  ['krankheit','infektion virus bakterie fieber malaria krebs grippe'],
  ['staat','regierung parlament gesetz wahl politik demokratie'],
  ['verkehr','auto zug flugzeug schiff fahrrad bus'],
  ['computer','prozessor speicher algorithmus programm software daten'],
  ['physik','energie kraft bewegung strom magnetismus licht schall'],
  ['mathematik','algebra geometrie zahl gleichung statistik wahrscheinlichkeit'],
  ['küche','essen brot käse obst gemüse fleisch gewürz'],
  ['obst','apfel birne banane orange pfirsich traube kirsche'],
];
for(const [category,members] of GERMAN_GROUPS){
  for(const member of members.split(' ')){
    edge(category,member,.8,'de');edge(member,category,.68,'de');
  }
}
edge('kalender','monat',.78,'de');edge('monat','kalender',.72,'de');
/** Avoid transitive false positives through encyclopedic umbrella categories.
 * For example, mathematics -> science -> biology must not be treated as a
 * close relationship, even though both disciplines share the science parent. */
const BROAD_HUBS = new Set('science nature biology geography mathematics physics chemistry music religion sport art medicine technology environment history wissenschaft natur biologie erde wasser mathematik physik chemie musik religion sport kunst medizin technik umwelt geschichte staat tier'.split(' '));
/** Short, weighted lexical paths only: no unrestricted graph diffusion. */
function conceptNeighbors(word,language){
  const graph=graphs[language];
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
export function conceptSimilarity(a,b,language='en'){
  return conceptBatch(a,[b],language)[b];
}
export function hasConcept(word,language){
  return graphs[language].has(normalizeWord(word));
}
export function conceptBatch(guess,targets,language='en'){
  const keys=conceptKeys(guess,language);
  const paths=keys.map(key=>conceptNeighbors(key,language));
  return Object.fromEntries(targets.map(target=>{
    const targetKeys=conceptKeys(target,language);
    let best=0;
    for(const [i,path] of paths.entries()){
      for(const [j,key] of targetKeys.entries()){
        const weight=(i===0?1:.88)*(j===0?1:.88);
        best=Math.max(best,(path.get(key)??0)*weight);
      }
    }
    return [target,best];
  }));
}
// Restrict compound matching to productive, unambiguous stems.
const COMPOUND_ROOTS=['sonne','mond','erde','himmel','planet','satellit','krieg','staat','religion','strom','schall','winkel','gestein','farbe','schwert','wald','insekt'];
function conceptKeys(value,language){
  const word=normalizeWord(value);
  const key=conceptKey(word,language);
  if(language!=='de')return [key];
  return [key,...COMPOUND_ROOTS.filter(root=>root!==key &&
    (word.length>=root.length+3 && word.startsWith(root) ||
     word.length>=root.length+3 && word.endsWith(root)))];
}
function conceptKey(value,language){
  const word=normalizeWord(value);
  const graph=graphs[language];
  if(graph.has(word))return word;
  const alternatives=language==='de'
    ? ['en','er','e','n','s'].filter(ending=>word.endsWith(ending)).map(ending=>word.slice(0,-ending.length))
    : [stemWord(word)];
  return alternatives.find(candidate=>graph.has(candidate))??word;
}
