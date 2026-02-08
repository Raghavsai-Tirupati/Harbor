/**
 * Google News RSS feed integration.
 * Fetches disaster-related news from Google News (free, no API key).
 * Returns articles from diverse sources: Reuters, BBC, Guardian, AP, CNN, etc.
 */

import { parseStringPromise } from 'xml2js';

/**
 * Fetch news articles for a specific disaster event via Google News RSS.
 * @param {string} query - Search query (e.g. disaster event title)
 * @param {number} max - Maximum articles to return
 * @returns {Promise<Array<{url: string, title: string, source: string, publishedAt: string}>>}
 */
export async function fetchGoogleNews(query, max = 8) {
  const encoded = encodeURIComponent(query);
  const rssUrl = `https://news.google.com/rss/search?q=${encoded}&hl=en-US&gl=US&ceid=US:en`;

  const res = await fetch(rssUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HarborDisasterApp/1.0)' },
  });
  if (!res.ok) throw new Error(`Google News RSS failed: ${res.status}`);

  const xml = await res.text();
  const parsed = await parseStringPromise(xml, { explicitArray: false });

  const channel = parsed?.rss?.channel;
  if (!channel || !channel.item) return [];

  const items = Array.isArray(channel.item) ? channel.item : [channel.item];

  return items.slice(0, max).map((item) => {
    const sourceObj = item.source || {};
    return {
      url: item.link || '',
      title: (item.title || 'Untitled').replace(/ - [^-]+$/, '').trim(),
      source: (typeof sourceObj === 'string' ? sourceObj : sourceObj._ || sourceObj['$']?.url || '').trim(),
      sourceUrl: sourceObj['$']?.url || '',
      publishedAt: item.pubDate || null,
    };
  }).filter((a) => a.url && a.title);
}

/**
 * Fetch general disaster headlines from Google News.
 * Uses a broad query to get diverse, relevant disaster news.
 */
export async function fetchDisasterHeadlines(max = 15) {
  return fetchGoogleNews(
    'natural disaster OR earthquake OR hurricane OR wildfire OR flood OR cyclone OR tsunami OR volcano OR tornado',
    max,
  );
}
