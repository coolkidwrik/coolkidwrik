// Generates assets/stats.svg and assets/languages.svg from the GitHub GraphQL API.
// No dependencies. Needs Node 18+. Usage: GITHUB_TOKEN=... node scripts/generate-stats.mjs <username>
// Set MOCK=1 to render with sample data (no network) for previewing the design.
import { mkdirSync, writeFileSync } from "node:fs";

const username = process.argv[2] || process.env.GITHUB_REPOSITORY_OWNER || "coolkidwrik";

const QUERY = `
query($login: String!) {
  user(login: $login) {
    name
    followers { totalCount }
    contributionsCollection {
      totalCommitContributions
      restrictedContributionsCount
      totalPullRequestContributions
      totalIssueContributions
      totalPullRequestReviewContributions
      contributionCalendar { totalContributions }
    }
    repositories(ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC, first: 100) {
      totalCount
      nodes {
        stargazerCount
        languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name color } }
        }
      }
    }
  }
}`;

async function fetchData() {
  if (process.env.MOCK) {
    return {
      name: "Wrik",
      followers: { totalCount: 12 },
      contributionsCollection: {
        totalCommitContributions: 412,
        restrictedContributionsCount: 30,
        totalPullRequestContributions: 18,
        totalIssueContributions: 7,
        totalPullRequestReviewContributions: 4,
        contributionCalendar: { totalContributions: 471 },
      },
      repositories: {
        totalCount: 24,
        nodes: [
          { stargazerCount: 5, languages: { edges: [
            { size: 90000, node: { name: "TypeScript", color: "#3178c6" } },
            { size: 30000, node: { name: "CSS", color: "#663399" } },
            { size: 5000, node: { name: "JavaScript", color: "#f1e05a" } } ] } },
          { stargazerCount: 2, languages: { edges: [
            { size: 40000, node: { name: "Python", color: "#3572A5" } },
            { size: 8000, node: { name: "HTML", color: "#e34c26" } } ] } },
        ],
      },
    };
  }
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not set");
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json", "User-Agent": "profile-stats" },
    body: JSON.stringify({ query: QUERY, variables: { login: username } }),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  if (!json.data.user) throw new Error(`User not found: ${username}`);
  return json.data.user;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = (n) => Number(n).toLocaleString("en-US");

// Light/dark aware styles (work inside <img> on GitHub).
const STYLE = `
  .bg{fill:#ffffff;stroke:#d0d7de}
  .title{fill:#1f2328;font:600 18px 'Segoe UI',Ubuntu,Helvetica,Arial,sans-serif}
  .label{fill:#656d76;font:400 14px 'Segoe UI',Ubuntu,Helvetica,Arial,sans-serif}
  .value{fill:#1f2328;font:600 14px 'Segoe UI',Ubuntu,Helvetica,Arial,sans-serif}
  .track{fill:#eaeef2}
  @media (prefers-color-scheme: dark){
    .bg{fill:#0d1117;stroke:#30363d}
    .title,.value{fill:#e6edf3}
    .label{fill:#8b949e}
    .track{fill:#21262d}
  }`;

function statsSvg(u) {
  const c = u.contributionsCollection;
  const stars = u.repositories.nodes.reduce((a, r) => a + r.stargazerCount, 0);
  const rows = [
    ["Contributions (last year)", c.contributionCalendar.totalContributions],
    ["Commits (last year)", c.totalCommitContributions + c.restrictedContributionsCount],
    ["Pull requests", c.totalPullRequestContributions],
    ["Issues opened", c.totalIssueContributions],
    ["Code reviews", c.totalPullRequestReviewContributions],
    ["Public repos", u.repositories.totalCount],
    ["Stars earned", stars],
    ["Followers", u.followers.totalCount],
  ];
  const h = 70 + rows.length * 26;
  const body = rows
    .map(([l, v], i) => `<text class="label" x="25" y="${68 + i * 26}">${esc(l)}</text><text class="value" x="395" y="${68 + i * 26}" text-anchor="end">${fmt(v)}</text>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="${h}" viewBox="0 0 420 ${h}" role="img" aria-label="GitHub stats for ${esc(username)}"><style>${STYLE}</style><rect class="bg" x="0.5" y="0.5" width="419" height="${h - 1}" rx="8"/><text class="title" x="25" y="35">${esc(username)}'s GitHub stats</text>${body}</svg>`;
}

// Languages to leave out of the "Top languages" card (case-insensitive).
const EXCLUDED_LANGUAGES = ["Jupyter Notebook", "HTML"];

function languagesSvg(u) {
  const totals = new Map();
  const excluded = new Set(EXCLUDED_LANGUAGES.map((l) => l.toLowerCase()));
  for (const r of u.repositories.nodes)
    for (const e of r.languages.edges) {
      if (excluded.has(e.node.name.toLowerCase())) continue;
      const t = totals.get(e.node.name) || { size: 0, color: e.node.color || "#8b949e" };
      t.size += e.size;
      totals.set(e.node.name, t);
    }
  const sorted = [...totals.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, 6);
  const sum = sorted.reduce((a, [, t]) => a + t.size, 0) || 1;
  const h = 70 + Math.max(sorted.length, 1) * 30;
  const body = sorted.length
    ? sorted
        .map(([name, t], i) => {
          const pct = (t.size / sum) * 100;
          const y = 62 + i * 30;
          return `<text class="label" x="25" y="${y + 11}">${esc(name)}</text><rect class="track" x="130" y="${y}" width="200" height="12" rx="6"/><rect x="130" y="${y}" width="${Math.max(4, (pct / 100) * 200)}" height="12" rx="6" fill="${esc(t.color)}"/><text class="value" x="395" y="${y + 11}" text-anchor="end">${pct.toFixed(1)}%</text>`;
        })
        .join("")
    : `<text class="label" x="25" y="75">No language data yet</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="${h}" viewBox="0 0 420 ${h}" role="img" aria-label="Top languages for ${esc(username)}"><style>${STYLE}</style><rect class="bg" x="0.5" y="0.5" width="419" height="${h - 1}" rx="8"/><text class="title" x="25" y="35">Top languages</text>${body}</svg>`;
}

const user = await fetchData();
mkdirSync("assets", { recursive: true });
writeFileSync("assets/stats.svg", statsSvg(user));
writeFileSync("assets/languages.svg", languagesSvg(user));
console.log("Wrote assets/stats.svg and assets/languages.svg");
