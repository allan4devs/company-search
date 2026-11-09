const familyDefinitions = [
  {
    id: "software-services",
    label: "software engineering and development services",
    patterns: [/software engineering/i, /software development/i, /custom software/i, /engineering services/i],
    models: ["outsourcing"],
    terms: ["software engineering", "software development", "custom software", "application development", "digital product engineering", "software services"],
    queries: ["global custom software development companies list", "global software engineering services firms directory"],
  },
  {
    id: "software-outsourcing",
    label: "software outsourcing and dedicated teams",
    patterns: [/outsourc/i],
    models: ["outsourcing"],
    terms: ["software outsourcing", "IT outsourcing", "offshore software development", "dedicated development team", "staff augmentation"],
    queries: ["global software outsourcing companies list", "software development staff augmentation companies directory"],
  },
  {
    id: "nearshore",
    label: "nearshore software engineering",
    patterns: [/nearshore/i],
    models: [],
    terms: ["nearshore software development", "nearshore engineering", "nearshore software", "nearshore staff augmentation"],
    queries: ["global nearshore software development companies list", "nearshore engineering firms worldwide directory"],
  },
  {
    id: "product-engineering",
    label: "product and full-stack engineering",
    patterns: [/product engineering/i, /full[\s-]?stack/i, /backend/i, /frontend/i],
    models: [],
    terms: ["product engineering", "full stack development", "backend engineering", "frontend engineering", "SaaS product development"],
    queries: ["global product engineering companies directory", "full stack software development companies worldwide list"],
  },
  {
    id: "direct-software-employers",
    label: "direct software product employers",
    patterns: [],
    models: ["direct"],
    terms: ["software product company", "direct software employer", "product engineering employer", "SaaS company"],
    queries: ["software product companies worldwide directory"],
  },
];

const stackTerms = ["Java", "React", "Node.js", "Python", "TypeScript", "JavaScript"];
const normalize = value => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function deriveKeywordProfile(likes) {
  const total = likes.length || 1;
  const familyCounts = Object.fromEntries(familyDefinitions.map(family => [family.id, 0]));
  const familyMatchedTracks = Object.fromEntries(familyDefinitions.map(family => [family.id, new Map()]));
  const stackCounts = new Map(stackTerms.map(term => [term, 0]));

  for (const company of likes) {
    const tracks = (company.tracks || []).map(String);
    const model = String(company.model || "unknown").toLowerCase();
    for (const family of familyDefinitions) {
      const matchedTracks = tracks.filter(track => family.patterns.some(pattern => pattern.test(track)));
      const matchedModel = family.models.includes(model);
      if (!matchedTracks.length && !matchedModel) continue;
      familyCounts[family.id] += 1;
      for (const track of matchedTracks) {
        const counts = familyMatchedTracks[family.id];
        counts.set(track, (counts.get(track) || 0) + 1);
      }
    }
    for (const term of stackTerms) {
      if (tracks.some(track => ` ${normalize(track)} `.includes(` ${normalize(term)} `))) {
        stackCounts.set(term, stackCounts.get(term) + 1);
      }
    }
  }

  const families = familyDefinitions.map(family => {
    const count = familyCounts[family.id];
    return {
      id: family.id, label: family.label, likedCompanyCount: count,
      share: Number((count / total).toFixed(3)),
      weight: Number((0.5 + (count / total) * 2).toFixed(2)),
      matchedTracks: [...familyMatchedTracks[family.id].entries()].sort((a, b) => b[1] - a[1]).map(([track, appearances]) => ({ track, appearances })),
      terms: family.terms,
      active: count > 0,
    };
  });
  const stack = [...stackCounts.entries()].filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1]).map(([term, count]) => ({ term, likedCompanyCount: count, share: Number((count / total).toFixed(3)) }));
  const topStack = stack.slice(0, 3);
  const stackQuery = topStack.length >= 2 ? {
    id: "liked-tech-stack",
    familyIds: ["product-engineering", "software-services"],
    query: `software development companies ${topStack.map(item => `\"${item.term}\"`).join(" ")} engineering list worldwide`,
    label: `software companies matching liked stack terms: ${topStack.map(item => item.term).join(", ")}`,
  } : null;
  return {
    totalLikedCompanies: likes.length,
    families,
    stack,
    stackQuery,
  };
}

export function buildKeywordSearchPlan(profile, budget = 6) {
  const familyPlans = [];
  for (const family of profile.families.filter(item => item.active)) {
    const definition = familyDefinitions.find(item => item.id === family.id);
    if (definition?.queries?.length) familyPlans.push({ family, queries: definition.queries });
  }
  const plan = familyPlans.map(({ family, queries }) => ({ id: `${family.id}-1`, label: family.label, queryFamily: family.id, query: queries[0] }));
  if (profile.stackQuery) plan.push(profile.stackQuery);
  for (let queryIndex = 1; familyPlans.some(item => item.queries[queryIndex]); queryIndex += 1) {
    for (const { family, queries } of familyPlans) {
      if (queries[queryIndex]) plan.push({ id: `${family.id}-${queryIndex + 1}`, label: family.label, queryFamily: family.id, query: queries[queryIndex] });
    }
  }
  const seen = new Set();
  return plan.filter(item => {
    const key = normalize(item.query);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, budget);
}

export function keywordAlignment(candidate, keywordProfile) {
  const evidenceText = normalize([
    candidate.name,
    ...(candidate.sources || []).map(source => source.sourceContext || ""),
  ].join(" "));
  const activeFamilies = (keywordProfile.families || []).filter(family => family.active);
  const contentMatches = activeFamilies.filter(family => family.terms.some(term => {
    const key = normalize(term);
    return key && ` ${evidenceText} `.includes(` ${key} `);
  }));
  const listFamilies = new Set((candidate.sources || []).flatMap(source => source.keywordFamilies || (source.queryFamily ? [source.queryFamily] : [])));
  const sourceMatches = activeFamilies.filter(family => listFamilies.has(family.id));
  const keywordScore = contentMatches.reduce((sum, family) => sum + family.weight * 2, 0);
  const laneScore = sourceMatches.reduce((sum, family) => sum + family.weight * 0.5, 0);
  const repeatScore = Math.max(0, (candidate.sourceMatchCount || (candidate.sources || []).length) - 1) * 0.6;
  return {
    matchedKeywordFamilies: contentMatches.map(family => family.id),
    matchedSourceFamilies: sourceMatches.map(family => family.id),
    keywordScore: Number(keywordScore.toFixed(2)),
    sourceFamilyScore: Number(laneScore.toFixed(2)),
    sourceRepeatScore: Number(repeatScore.toFixed(2)),
    similarityScore: Number((keywordScore + laneScore + repeatScore).toFixed(2)),
  };
}

export function isLikelyCompanyListResult(result) {
  const titleAndUrl = normalize(`${result.title || ""} ${result.url || ""}`);
  const evidence = normalize(`${titleAndUrl} ${result.snippet || ""}`);
  return /\b(?:top|best|leading|directory|list|companies|firms|providers|ranked|comparison)\b/.test(evidence)
    && !/\b(?:jobs?|careers?|salary|interview|job board|resume)\b/.test(titleAndUrl);
}
