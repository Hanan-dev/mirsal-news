from concurrent.futures import ThreadPoolExecutor
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
API_URL = "https://newsapi.org/v2/top-headlines"
VALID_COUNTRIES = {"us", "gb", "ca", "au", "in"}
VALID_CATEGORIES = {"business", "entertainment", "general", "health", "science", "sports", "technology"}
MAX_MERGED_ARTICLES = 50
STATIC_FILES = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
    "/styles.css": ("styles.css", "text/css; charset=utf-8"),
    "/assets/mirsal-icon.png": ("assets/mirsal-icon.png", "image/png"),
    "/assets/mirsal-logo.png": ("assets/mirsal-logo.png", "image/png"),
}


def load_env_file():
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        os.environ.setdefault(name.strip(), value.strip().strip("\"'"))


def requested_categories(query):
    selected = query.get("categories")
    if selected:
        categories = [
            category.strip().lower()
            for value in selected
            for category in value.split(",")
            if category.strip()
        ]
    else:
        categories = [query.get("category", ["general"])[0].strip().lower()]

    categories = list(dict.fromkeys(categories))
    if not categories or any(category not in VALID_CATEGORIES for category in categories):
        raise ValueError("Unsupported country or category.")
    return categories


def merge_category_articles(categories, payloads):
    articles_by_url = {}
    total_results = 0
    for category, payload in zip(categories, payloads):
        total_results += payload.get("totalResults", 0)
        for article in payload.get("articles", []):
            url = article.get("url")
            if not url or url in articles_by_url:
                continue
            categorized_article = dict(article)
            categorized_article["category"] = category
            articles_by_url[url] = categorized_article

    articles = sorted(
        articles_by_url.values(),
        key=lambda article: article.get("publishedAt") or "",
        reverse=True,
    )
    return {
        "status": "ok",
        "totalResults": total_results,
        "articles": articles[:MAX_MERGED_ARTICLES],
    }


class NewsFeedHandler(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        request_path = urlparse(self.path)
        if request_path.path == "/api/news":
            self.handle_news(parse_qs(request_path.query))
            return

        static_file = STATIC_FILES.get(request_path.path)
        if not static_file:
            self.send_error(404, "Not found")
            return

        filename, content_type = static_file
        body = (ROOT / filename).read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_news(self, query):
        api_key = os.environ.get("NEWSAPI_KEY")
        if not api_key:
            self.send_json(503, {
                "code": "apiKeyMissing",
                "message": "Add NEWSAPI_KEY to .env, then restart the server.",
            })
            return

        country = query.get("country", ["us"])[0].lower()
        search_term = query.get("q", [""])[0].strip()[:200]
        try:
            categories = requested_categories(query)
        except ValueError as error:
            self.send_json(400, {"message": str(error)})
            return
        if country not in VALID_COUNTRIES:
            self.send_json(400, {"message": "Unsupported country or category."})
            return

        try:
            with ThreadPoolExecutor(max_workers=min(len(categories), 4)) as executor:
                payloads = list(executor.map(
                    lambda category: self.fetch_category(api_key, country, category, search_term),
                    categories,
                ))
            self.send_json(200, merge_category_articles(categories, payloads))
        except HTTPError as error:
            try:
                payload = json.loads(error.read().decode("utf-8"))
            except (ValueError, UnicodeDecodeError):
                payload = {"message": "NewsAPI returned an HTTP error."}
            self.send_json(error.code, payload)
        except (URLError, TimeoutError):
            self.send_json(502, {"message": "Could not reach NewsAPI. Check your connection and try again."})
        except (ValueError, UnicodeDecodeError):
            self.send_json(502, {"message": "NewsAPI returned an unreadable response."})

    def fetch_category(self, api_key, country, category, search_term):
        parameters = {"country": country, "pageSize": 20, "category": category}
        if search_term:
            parameters["q"] = search_term
        request = Request(
            "{}?{}".format(API_URL, urlencode(parameters)),
            headers={"X-Api-Key": api_key, "Accept": "application/json"},
        )
        with urlopen(request, timeout=15) as response:
            return json.loads(response.read().decode("utf-8"))

    def log_message(self, format_string, *args):
        print("{} - {}".format(self.address_string(), format_string % args))


if __name__ == "__main__":
    load_env_file()
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer(("127.0.0.1", port), NewsFeedHandler)
    print("Signal is running at http://127.0.0.1:{}/".format(port))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Signal.")
    finally:
        server.server_close()