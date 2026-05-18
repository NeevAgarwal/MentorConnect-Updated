export function buildMentorQuery() {
  const q = new URLSearchParams();
  const search = document.getElementById("mentorSearch")?.value?.trim();
  const domain = document.getElementById("filterDomain")?.value || "";
  const minP = document.getElementById("filterMinPrice")?.value;
  const maxP = document.getElementById("filterMaxPrice")?.value;
  const minR = document.getElementById("filterMinRating")?.value;
  const sort = document.getElementById("filterSort")?.value || "recommended";
  if (search) q.set("q", search);
  if (domain) q.set("domain", domain);
  if (minP) q.set("minPrice", minP);
  if (maxP) q.set("maxPrice", maxP);
  if (minR) q.set("minRating", minR);
  if (sort) q.set("sort", sort);
  const skills = document.getElementById("filterSkills")?.value?.trim();
  if (skills) q.set("skills", skills);
  return q.toString();
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), ms);
  };
}
