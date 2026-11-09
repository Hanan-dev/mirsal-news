# Mirsal News

Mirsal is a calmer way to keep up with the stories shaping your day. Browse current headlines, tailor your feed to the topics you care about, and save stories to read later.

## Brand and typography

Mirsal uses a blue-and-coral inline SVG wordmark with blue interface accents and a pale, cool reading canvas. The logo is embedded in the page, so it does not rely on a separate image file. Plus Jakarta Sans is used for interface text; Poppins is used for headlines and editorial reading.

## Features

- **Editorial homepage:** Browse a featured story, latest headlines, a balanced selection labeled “Editor’s Picks,” and topic-based recommendations.
- **Five-Minute Brief and Trending Now:** Scan short lists drawn from the current edition. “Trending Now” is a recent-headline selection, not a popularity ranking.
- **Personalized feed:** Choose favorite topics and combine their headlines in your **For you** feed. Preferences are saved in your browser.
- **Topic browsing:** Filter the feed by World, Technology, Business, Culture, or Science.
- **Search and sorting:** Search headlines and descriptions, then sort stories by recommended order or publication time.
- **Country editions:** Browse headlines for the United States, United Kingdom, Canada, Australia, or India.
- **Read later:** Keep a searchable, browser-saved list of articles to revisit.
- **Publisher-sourced stories:** Show article headlines, available summaries, publisher details, publication times, original-source links, and publisher-provided images. Missing summaries and images are identified rather than replaced with invented content.
- **Editorial story pages:** Open a dedicated reading view with the publisher summary, source link, save/share actions, and related headlines.
- **Profile menu:** Open quick actions for the reading list and topic preferences.
- **Audio briefing:** Listen to the current headlines with browser text-to-speech controls.

## Requirements

- Python 3.9 or later
- A [NewsAPI](https://newsapi.org/) API key

## Run locally

1. Copy `.env.example` to `.env`.
2. Set `NEWSAPI_KEY` in `.env` to your NewsAPI key. Keep this key private; the local server uses it so it is not exposed in browser code.
3. Start the server from the project directory:

   ```bash
   python3 server.py
   ```

4. Open [http://127.0.0.1:8000](http://127.0.0.1:8000).

To use a different local port, set the `PORT` environment variable before starting the server.

## Notes

The app fetches headlines from NewsAPI's Top Headlines endpoint. NewsAPI plan limits and availability apply. “Editor’s Picks” is a balanced selection from the available headlines, not a human-curated list; the API does not provide popularity data for ranking “Trending Now.” Favorite topics and saved stories are stored locally in the current browser and are not synced between devices.
