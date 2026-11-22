/** Cookie silhouettes. The first 20 are the reference application's popular shapes.
 * Others are from Print Factory's existing MIT-licensed filled-symbol library. */
export interface CookieShape { id: string; label: string; category: string; symbol: string | null }
export const READY_CATEGORIES = ['Most popular', 'Christmas', 'Winter', 'Love and wedding', 'Birthday and baby', 'Easter and spring', 'Animals', 'Halloween', 'Plaques for names', 'Geometric', 'Basics and figures', 'All'] as const;
export const COOKIE_SHAPES: readonly CookieShape[] = [
  {
    "id": "gingerbread-man",
    "label": "Gingerbread man",
    "category": "Christmas",
    "symbol": "tabler:cookie-man"
  },
  {
    "id": "christmas-tree",
    "label": "Christmas tree",
    "category": "Christmas",
    "symbol": "tabler:christmas-tree"
  },
  {
    "id": "star",
    "label": "Star",
    "category": "Geometric",
    "symbol": "tabler:star"
  },
  {
    "id": "snowflake",
    "label": "Snowflake",
    "category": "Winter",
    "symbol": null
  },
  {
    "id": "bell",
    "label": "Bell",
    "category": "Christmas",
    "symbol": "tabler:bell"
  },
  {
    "id": "candy-cane",
    "label": "Candy cane",
    "category": "Christmas",
    "symbol": null
  },
  {
    "id": "reindeer",
    "label": "Reindeer",
    "category": "Christmas",
    "symbol": null
  },
  {
    "id": "santa-hat",
    "label": "Santa hat",
    "category": "Christmas",
    "symbol": null
  },
  {
    "id": "mitten",
    "label": "Mitten",
    "category": "Winter",
    "symbol": null
  },
  {
    "id": "stocking",
    "label": "Stocking",
    "category": "Christmas",
    "symbol": null
  },
  {
    "id": "snowman",
    "label": "Snowman",
    "category": "Winter",
    "symbol": null
  },
  {
    "id": "gift-box",
    "label": "Gift box",
    "category": "Birthday and baby",
    "symbol": "tabler:gift"
  },
  {
    "id": "bauble-star",
    "label": "Bauble with star",
    "category": "Christmas",
    "symbol": null
  },
  {
    "id": "heart",
    "label": "Heart",
    "category": "Love and wedding",
    "symbol": "tabler:heart"
  },
  {
    "id": "wreath",
    "label": "Wreath",
    "category": "Christmas",
    "symbol": null
  },
  {
    "id": "cinnamon-sticks",
    "label": "Cinnamon sticks",
    "category": "Christmas",
    "symbol": null
  },
  {
    "id": "angel",
    "label": "Angel",
    "category": "Christmas",
    "symbol": null
  },
  {
    "id": "santa-claus",
    "label": "Santa Claus",
    "category": "Christmas",
    "symbol": null
  },
  {
    "id": "gingerbread-house",
    "label": "Gingerbread house",
    "category": "Christmas",
    "symbol": null
  },
  {
    "id": "classic-tree",
    "label": "Classic tree",
    "category": "Christmas",
    "symbol": null
  },
  {
    "id": "more-heart-broken",
    "label": "Heart Broken",
    "category": "Love and wedding",
    "symbol": "tabler:heart-broken"
  },
  {
    "id": "more-flower",
    "label": "Flower",
    "category": "Love and wedding",
    "symbol": "tabler:flower"
  },
  {
    "id": "more-diamond",
    "label": "Diamond",
    "category": "Love and wedding",
    "symbol": "tabler:diamond"
  },
  {
    "id": "more-diamonds",
    "label": "Diamonds",
    "category": "Love and wedding",
    "symbol": "tabler:diamonds"
  },
  {
    "id": "more-rosette",
    "label": "Rosette",
    "category": "Love and wedding",
    "symbol": "tabler:rosette"
  },
  {
    "id": "more-laurel-wreath",
    "label": "Laurel Wreath",
    "category": "Love and wedding",
    "symbol": "tabler:laurel-wreath"
  },
  {
    "id": "more-laurel-wreath-1",
    "label": "Laurel Wreath 1",
    "category": "Love and wedding",
    "symbol": "tabler:laurel-wreath-1"
  },
  {
    "id": "more-bow",
    "label": "Bow",
    "category": "Love and wedding",
    "symbol": "tabler:bow"
  },
  {
    "id": "more-laurel-wreath-2",
    "label": "Laurel Wreath 2",
    "category": "Love and wedding",
    "symbol": "tabler:laurel-wreath-2"
  },
  {
    "id": "more-laurel-wreath-3",
    "label": "Laurel Wreath 3",
    "category": "Love and wedding",
    "symbol": "tabler:laurel-wreath-3"
  },
  {
    "id": "more-balloon",
    "label": "Balloon",
    "category": "Birthday and baby",
    "symbol": "tabler:balloon"
  },
  {
    "id": "more-confetti",
    "label": "Confetti",
    "category": "Birthday and baby",
    "symbol": "tabler:confetti"
  },
  {
    "id": "more-cookie",
    "label": "Cookie",
    "category": "Birthday and baby",
    "symbol": "tabler:cookie"
  },
  {
    "id": "more-mug",
    "label": "Mug",
    "category": "Birthday and baby",
    "symbol": "tabler:mug"
  },
  {
    "id": "more-gift-card",
    "label": "Gift Card",
    "category": "Birthday and baby",
    "symbol": "tabler:gift-card"
  },
  {
    "id": "more-baby-carriage",
    "label": "Baby Carriage",
    "category": "Birthday and baby",
    "symbol": "tabler:baby-carriage"
  },
  {
    "id": "more-trophy",
    "label": "Trophy",
    "category": "Birthday and baby",
    "symbol": "tabler:trophy"
  },
  {
    "id": "more-award",
    "label": "Award",
    "category": "Birthday and baby",
    "symbol": "tabler:award"
  },
  {
    "id": "more-star-half",
    "label": "Star Half",
    "category": "Birthday and baby",
    "symbol": "tabler:star-half"
  },
  {
    "id": "more-stars",
    "label": "Stars",
    "category": "Birthday and baby",
    "symbol": "tabler:stars"
  },
  {
    "id": "more-badges",
    "label": "Badges",
    "category": "Birthday and baby",
    "symbol": "tabler:badges"
  },
  {
    "id": "more-egg",
    "label": "Egg",
    "category": "Easter and spring",
    "symbol": "tabler:egg"
  },
  {
    "id": "more-egg-cracked",
    "label": "Egg Cracked",
    "category": "Easter and spring",
    "symbol": "tabler:egg-cracked"
  },
  {
    "id": "more-butterfly",
    "label": "Butterfly",
    "category": "Easter and spring",
    "symbol": "tabler:butterfly"
  },
  {
    "id": "more-clover",
    "label": "Clover",
    "category": "Easter and spring",
    "symbol": "tabler:clover"
  },
  {
    "id": "more-seedling",
    "label": "Seedling",
    "category": "Easter and spring",
    "symbol": "tabler:seedling"
  },
  {
    "id": "more-cherry",
    "label": "Cherry",
    "category": "Easter and spring",
    "symbol": "tabler:cherry"
  },
  {
    "id": "more-cactus",
    "label": "Cactus",
    "category": "Easter and spring",
    "symbol": "tabler:cactus"
  },
  {
    "id": "more-sun",
    "label": "Sun",
    "category": "Easter and spring",
    "symbol": "tabler:sun"
  },
  {
    "id": "more-feather",
    "label": "Feather",
    "category": "Easter and spring",
    "symbol": "tabler:feather"
  },
  {
    "id": "more-mushroom",
    "label": "Mushroom",
    "category": "Easter and spring",
    "symbol": "tabler:mushroom"
  },
  {
    "id": "more-apple",
    "label": "Apple",
    "category": "Easter and spring",
    "symbol": "tabler:apple"
  },
  {
    "id": "more-pig",
    "label": "Pig",
    "category": "Animals",
    "symbol": "tabler:pig"
  },
  {
    "id": "more-spider",
    "label": "Spider",
    "category": "Animals",
    "symbol": "tabler:spider"
  },
  {
    "id": "more-paw",
    "label": "Paw",
    "category": "Animals",
    "symbol": "tabler:paw"
  },
  {
    "id": "more-fish-bone",
    "label": "Fish Bone",
    "category": "Animals",
    "symbol": "tabler:fish-bone"
  },
  {
    "id": "more-mickey",
    "label": "Mickey",
    "category": "Animals",
    "symbol": "tabler:mickey"
  },
  {
    "id": "more-bone",
    "label": "Bone",
    "category": "Animals",
    "symbol": "tabler:bone"
  },
  {
    "id": "more-ghost",
    "label": "Ghost",
    "category": "Halloween",
    "symbol": "tabler:ghost"
  },
  {
    "id": "more-ghost-2",
    "label": "Ghost 2",
    "category": "Halloween",
    "symbol": "tabler:ghost-2"
  },
  {
    "id": "more-ghost-3",
    "label": "Ghost 3",
    "category": "Halloween",
    "symbol": "tabler:ghost-3"
  },
  {
    "id": "more-alien",
    "label": "Alien",
    "category": "Halloween",
    "symbol": "tabler:alien"
  },
  {
    "id": "more-moon",
    "label": "Moon",
    "category": "Halloween",
    "symbol": "tabler:moon"
  },
  {
    "id": "more-flame",
    "label": "Flame",
    "category": "Halloween",
    "symbol": "tabler:flame"
  },
  {
    "id": "more-poo",
    "label": "Poo",
    "category": "Halloween",
    "symbol": "tabler:poo"
  },
  {
    "id": "more-bomb",
    "label": "Bomb",
    "category": "Halloween",
    "symbol": "tabler:bomb"
  },
  {
    "id": "more-biohazard",
    "label": "Biohazard",
    "category": "Halloween",
    "symbol": "tabler:biohazard"
  },
  {
    "id": "more-home",
    "label": "Home",
    "category": "Plaques for names",
    "symbol": "tabler:home"
  },
  {
    "id": "more-label",
    "label": "Label",
    "category": "Plaques for names",
    "symbol": "tabler:label"
  },
  {
    "id": "more-shield",
    "label": "Shield",
    "category": "Plaques for names",
    "symbol": "tabler:shield"
  },
  {
    "id": "more-square-rounded",
    "label": "Square Rounded",
    "category": "Plaques for names",
    "symbol": "tabler:square-rounded"
  },
  {
    "id": "more-rectangle",
    "label": "Rectangle",
    "category": "Plaques for names",
    "symbol": "tabler:rectangle"
  },
  {
    "id": "more-square",
    "label": "Square",
    "category": "Plaques for names",
    "symbol": "tabler:square"
  },
  {
    "id": "more-oval-vertical",
    "label": "Oval Vertical",
    "category": "Plaques for names",
    "symbol": "tabler:oval-vertical"
  },
  {
    "id": "more-circle",
    "label": "Circle",
    "category": "Geometric",
    "symbol": "tabler:circle"
  },
  {
    "id": "more-oval",
    "label": "Oval",
    "category": "Geometric",
    "symbol": "tabler:oval"
  },
  {
    "id": "more-hexagon",
    "label": "Hexagon",
    "category": "Geometric",
    "symbol": "tabler:hexagon"
  },
  {
    "id": "more-octagon",
    "label": "Octagon",
    "category": "Geometric",
    "symbol": "tabler:octagon"
  },
  {
    "id": "more-pentagon",
    "label": "Pentagon",
    "category": "Geometric",
    "symbol": "tabler:pentagon"
  },
  {
    "id": "more-triangle",
    "label": "Triangle",
    "category": "Geometric",
    "symbol": "tabler:triangle"
  },
  {
    "id": "more-square-rotated",
    "label": "Square Rotated",
    "category": "Geometric",
    "symbol": "tabler:square-rotated"
  },
  {
    "id": "more-capsule",
    "label": "Capsule",
    "category": "Geometric",
    "symbol": "tabler:capsule"
  },
  {
    "id": "more-circle-rectangle",
    "label": "Circle Rectangle",
    "category": "Geometric",
    "symbol": "tabler:circle-rectangle"
  },
  {
    "id": "more-squares",
    "label": "Squares",
    "category": "Geometric",
    "symbol": "tabler:squares"
  },
  {
    "id": "more-triangle-inverted",
    "label": "Triangle Inverted",
    "category": "Geometric",
    "symbol": "tabler:triangle-inverted"
  },
  {
    "id": "more-circle-dot",
    "label": "Circle Dot",
    "category": "Geometric",
    "symbol": "tabler:circle-dot"
  },
  {
    "id": "more-hexagon-plus",
    "label": "Hexagon Plus",
    "category": "Geometric",
    "symbol": "tabler:hexagon-plus"
  },
  {
    "id": "more-square-rounded-plus",
    "label": "Square Rounded Plus",
    "category": "Geometric",
    "symbol": "tabler:square-rounded-plus"
  },
  {
    "id": "more-clubs",
    "label": "Clubs",
    "category": "Geometric",
    "symbol": "tabler:clubs"
  },
  {
    "id": "more-spade",
    "label": "Spade",
    "category": "Geometric",
    "symbol": "tabler:spade"
  },
  {
    "id": "more-cloud",
    "label": "Cloud",
    "category": "Basics and figures",
    "symbol": "tabler:cloud"
  },
  {
    "id": "more-sun-high",
    "label": "Sun High",
    "category": "Basics and figures",
    "symbol": "tabler:sun-high"
  },
  {
    "id": "more-cone",
    "label": "Cone",
    "category": "Basics and figures",
    "symbol": "tabler:cone"
  },
  {
    "id": "more-lemon-2",
    "label": "Lemon 2",
    "category": "Basics and figures",
    "symbol": "tabler:lemon-2"
  },
  {
    "id": "more-pizza",
    "label": "Pizza",
    "category": "Basics and figures",
    "symbol": "tabler:pizza"
  },
  {
    "id": "more-bread",
    "label": "Bread",
    "category": "Basics and figures",
    "symbol": "tabler:bread"
  },
  {
    "id": "more-bottle",
    "label": "Bottle",
    "category": "Basics and figures",
    "symbol": "tabler:bottle"
  },
  {
    "id": "more-bike",
    "label": "Bike",
    "category": "Basics and figures",
    "symbol": "tabler:bike"
  },
  {
    "id": "more-car",
    "label": "Car",
    "category": "Basics and figures",
    "symbol": "tabler:car"
  },
  {
    "id": "more-train",
    "label": "Train",
    "category": "Basics and figures",
    "symbol": "tabler:train"
  },
  {
    "id": "more-ufo",
    "label": "Ufo",
    "category": "Basics and figures",
    "symbol": "tabler:ufo"
  },
  {
    "id": "more-mountain",
    "label": "Mountain",
    "category": "Basics and figures",
    "symbol": "tabler:mountain"
  },
  {
    "id": "more-chef-hat",
    "label": "Chef Hat",
    "category": "Basics and figures",
    "symbol": "tabler:chef-hat"
  },
  {
    "id": "more-key",
    "label": "Key",
    "category": "Basics and figures",
    "symbol": "tabler:key"
  }
];
export const COOKIE_IDS = COOKIE_SHAPES.map((s) => s.id);
export function cookieShape(id: string): CookieShape { return COOKIE_SHAPES.find((s) => s.id === id) ?? COOKIE_SHAPES[0]!; }
