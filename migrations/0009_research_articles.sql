-- Research articles: a topic is researched via one or more backends
-- (Consensus, Europe PMC, WebSearch, Gossip) and drafted into a cited article.
-- Each backend ("mode") gets its own body, sources, and research direction,
-- mirroring the four-tab encyclopedia model. Sources and tags are JSON arrays.
CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  tags TEXT,
  consensus_body TEXT,
  websearch_body TEXT,
  europepmc_body TEXT,
  gossip_body TEXT,
  sources_consensus TEXT,
  sources_websearch TEXT,
  sources_europepmc TEXT,
  sources_gossip TEXT,
  prompt_consensus TEXT,
  prompt_websearch TEXT,
  prompt_europepmc TEXT,
  prompt_gossip TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_articles_updated_at ON articles(updated_at);
