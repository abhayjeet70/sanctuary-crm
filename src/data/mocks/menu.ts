import type { MenuItem } from "@/types";
import { placeholder as dish } from "@/lib/assets";

export const menuItems: MenuItem[] = [
  {
    id: "m-101",
    name: "Set Dosa with Vegetable Kurma",
    description:
      "Three soft dosas cooked on the griddle, served with a mild coconut kurma and coriander chutney.",
    price: 320,
    image: dish("hos-set-dosa"),
    category: "south_indian",
    isVeg: true,
    available: true,
  },
  {
    id: "m-102",
    name: "Bisi Bele Bath",
    description:
      "The Karnataka classic — rice, lentils and vegetables in a roasted spice blend, finished with ghee and crisp boondi.",
    price: 340,
    image: dish("hos-bisibele"),
    category: "south_indian",
    isVeg: true,
    available: true,
  },
  {
    id: "m-103",
    name: "Nandi Hills Filter Coffee",
    description:
      "Chicory-blend decoction from a Chikmagalur estate, brewed overnight and served in the traditional davara set.",
    price: 140,
    image: dish("hos-filter-coffee"),
    category: "beverages",
    isVeg: true,
    available: true,
  },
  {
    id: "m-104",
    name: "Akki Roti with Ennegayi",
    description:
      "Hand-pressed rice flour rotis with stuffed baby brinjal in a peanut and sesame masala.",
    price: 360,
    image: dish("hos-akki-roti"),
    category: "breakfast",
    isVeg: true,
    available: true,
  },
  {
    id: "m-105",
    name: "Verandah Breakfast Plate",
    description:
      "Two eggs your way, sourdough toast, orchard preserve, grilled tomato and a glass of cold-pressed juice.",
    price: 480,
    image: dish("hos-breakfast-plate"),
    category: "breakfast",
    isVeg: false,
    available: true,
  },
  {
    id: "m-106",
    name: "Charred Corn and Avocado Salad",
    description:
      "Fire-roasted corn, avocado, cherry tomato and feta with a lime and toasted cumin dressing.",
    price: 420,
    image: dish("hos-corn-salad"),
    category: "continental",
    isVeg: true,
    available: true,
  },
  {
    id: "m-107",
    name: "Wood-Fired Margherita",
    description:
      "Slow-proved base, San Marzano tomato, buffalo mozzarella and basil from the kitchen garden.",
    price: 560,
    image: dish("hos-margherita"),
    category: "continental",
    isVeg: true,
    available: true,
  },
  {
    id: "m-108",
    name: "Coorg Pandi Curry with Kadambuttu",
    description:
      "Slow-cooked pork in kachampuli and Coorg spices, served with steamed rice dumplings.",
    price: 720,
    image: dish("hos-pandi-curry"),
    category: "lunch",
    isVeg: false,
    available: true,
  },
  {
    id: "m-109",
    name: "Malnad Chicken Curry Thali",
    description:
      "Country chicken in a roasted coconut gravy with jowar roti, rice, palya and a curd salad.",
    price: 680,
    image: dish("hos-malnad-thali"),
    category: "lunch",
    isVeg: false,
    available: true,
  },
  {
    id: "m-110",
    name: "Sanctuary Vegetarian Thali",
    description:
      "Seasonal palya, dal, sambar, rasam, curd, two rotis, rice and a sweet — changes with the kitchen garden.",
    price: 540,
    image: dish("hos-veg-thali"),
    category: "dinner",
    isVeg: true,
    available: true,
  },
  {
    id: "m-111",
    name: "Grilled Fish with Verandah Herbs",
    description:
      "Line-caught seer fish grilled over charcoal, with burnt-butter greens and a lemon caper dressing.",
    price: 860,
    image: dish("hos-grilled-fish"),
    category: "dinner",
    isVeg: false,
    available: false,
  },
  {
    id: "m-112",
    name: "Masala Peanuts and Papad Basket",
    description:
      "Crisp masala peanuts, roasted papad and a green chilli pickle — the standard sundowner order.",
    price: 240,
    image: dish("hos-masala-peanuts"),
    category: "snacks",
    isVeg: true,
    available: true,
  },
  {
    id: "m-113",
    name: "Mangalore Bajji with Chutney",
    description:
      "Golden goli bajji, fried to order, with coconut chutney and a cup of hot ginger tea.",
    price: 260,
    image: dish("hos-bajji"),
    category: "snacks",
    isVeg: true,
    available: true,
  },
  {
    id: "m-114",
    name: "Estate Nilgiri Tea",
    description: "Single-estate Nilgiri leaf, served as a pot for two with jaggery on the side.",
    price: 180,
    image: dish("hos-nilgiri-tea"),
    category: "beverages",
    isVeg: true,
    available: true,
  },
  {
    id: "m-115",
    name: "Tender Coconut Cooler",
    description: "Fresh tender coconut water with lime, mint and a touch of black salt.",
    price: 200,
    image: dish("hos-coconut-cooler"),
    category: "beverages",
    isVeg: true,
    available: true,
  },
];
