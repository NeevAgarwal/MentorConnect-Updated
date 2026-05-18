// ── Mentor Data ──
const mentors = [
  { id:1, name:"Aanya Sharma",  role:"Senior Frontend Engineer", company:"Google",    skills:["React","CSS","UI/UX"],          rating:4.9, reviews:128, price:800, avatar:"AS", domain:"Engineering" },
  { id:2, name:"Rohan Mehta",   role:"Data Scientist",           company:"Microsoft", skills:["Python","ML","Statistics"],      rating:4.8, reviews:94,  price:600, avatar:"RM", domain:"Data"        },
  { id:3, name:"Priya Kapoor",  role:"Product Manager",          company:"Flipkart",  skills:["Strategy","Roadmaps","Agile"],   rating:4.9, reviews:211, price:750, avatar:"PK", domain:"Product"     },
  { id:4, name:"Dev Patel",     role:"Backend Engineer",         company:"Razorpay",  skills:["Node.js","AWS","MongoDB"],       rating:4.7, reviews:76,  price:500, avatar:"DP", domain:"Engineering" },
  { id:5, name:"Sneha Joshi",   role:"UX Designer",              company:"Adobe",     skills:["Figma","Research","Prototyping"],rating:4.8, reviews:103, price:650, avatar:"SJ", domain:"Design"      },
  { id:6, name:"Arjun Nair",    role:"Full Stack Developer",     company:"Swiggy",    skills:["React","Node.js","SQL"],         rating:4.6, reviews:58,  price:450, avatar:"AN", domain:"Engineering" },
];

// ── Domain Filters ──
const domains = ["All","Engineering","Design","Product","Data"];

// ── Quick Search Tags ──
const quickTags = ["React","Python","Product","ML","UI/UX","Node.js"];

// ── How It Works Steps (icon = lucide icon name) ──
const steps = [
  { icon:"search",   title:"Search",  desc:"Find mentors by skill, domain, or career goal" },
  { icon:"layout-list", title:"Explore", desc:"Browse profiles, reviews, and experience"  },
  { icon:"calendar", title:"Book",    desc:"Schedule a session at your convenience"        },
  { icon:"trending-up", title:"Grow", desc:"Get guidance and level up your career"         },
];