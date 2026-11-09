const topicCategories = { All: "general", World: "general", Technology: "technology", Business: "business", Culture: "entertainment", Science: "science" };
const categoryColors = { World: "world", Technology: "technology", Business: "business", Culture: "culture", Science: "science" };
const topicNames = { general: "News", technology: "Technology", business: "Business", entertainment: "Culture", science: "Science" };
const availableTopics = Object.keys(topicCategories).filter((topic) => topic !== "All");
const state = { view: "for-you", topic: "All", favoriteTopics: loadFavoriteTopics(), query: "", sort: "recommended", country: "us", stories: [], saved: loadSaved(), loading: false, error: "", requestId: 0, activeStory: null, visibleStories: [] };
const grid = document.querySelector("#story-grid");
const emptyState = document.querySelector("#empty-state");
const searchInput = document.querySelector("#search-input");
const topicsDialog = document.querySelector("#topics-dialog");
const feedMessage = document.querySelector("#feed-message");
const feedMessageText = document.querySelector("#feed-message-text");
let toastTimer;
let searchTimer;
let briefingUtterance = null;
let briefingState = "idle";

function loadSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem("signal-saved-stories") || "[]");
    return Array.isArray(saved) ? saved.filter((story) => story && typeof story === "object" && story.url) : [];
  }
  catch { return []; }
}

function loadFavoriteTopics() {
  try {
    const topics = JSON.parse(localStorage.getItem("signal-favorite-topics") || "[]");
    return Array.isArray(topics) ? [...new Set(topics.filter((topic) => availableTopics.includes(topic)))] : [];
  } catch {
    return [];
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
}

function safeUrl(value, allowHttp = false) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || (allowHttp && url.protocol === "http:") ? url.href : "";
  } catch { return ""; }
}

function storyHref(id) {
  return `#story?url=${encodeURIComponent(id)}`;
}

function formatTime(value) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  if (!Number.isFinite(elapsed)) return "RECENTLY";
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return "JUST NOW";
  if (minutes < 60) return `${minutes} MIN AGO`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} HR${hours === 1 ? "" : "S"} AGO`;
  return `${Math.floor(hours / 24)} DAY${hours < 48 ? "" : "S"} AGO`;
}

function formatPublishedAt(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Publication time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function normalizeArticle(article) {
  const url = safeUrl(article.url, true);
  if (!url || !article.title || article.title === "[Removed]") return null;
  const category = state.topic !== "All"
    ? state.topic
    : article.category === "general" && state.favoriteTopics.includes("World")
      ? "World"
      : topicNames[article.category] || "News";
  return {
    id: url,
    url,
    title: article.title,
    deck: typeof article.description === "string" && article.description.trim()
      ? article.description.trim()
      : "Publisher summary unavailable.",
    source: article.source?.name || "News source",
    author: article.author || article.source?.name || "News desk",
    image: safeUrl(article.urlToImage),
    publishedAt: article.publishedAt,
    category,
    color: categoryColors[category] || "news",
    minutes: "5 MIN READ"
  };
}

function renderEditorialItem(story) {
  const publisherUrl = safeUrl(story.url, true);
  const isSaved = state.saved.some((saved) => saved.id === story.id);
  return `
    <article class="editorial-item">
      <a class="editorial-item-image" href="${escapeHtml(storyHref(story.id))}" aria-label="Read: ${escapeHtml(story.title)}">
        ${story.image
          ? `<img src="${escapeHtml(story.image)}" alt="" loading="lazy" data-news-image /><span class="image-fallback" hidden><i data-lucide="newspaper"></i><span>Image unavailable</span></span>`
          : '<span class="image-fallback"><i data-lucide="newspaper"></i><span>Image unavailable</span></span>'}
      </a>
      <div class="editorial-item-copy">
        <div class="card-meta"><span class="category-tag tag-${story.color}">${escapeHtml(story.category.toUpperCase())}</span><span>${escapeHtml(story.source)}</span><time datetime="${escapeHtml(story.publishedAt || "")}" title="${escapeHtml(formatPublishedAt(story.publishedAt))}">${escapeHtml(formatPublishedAt(story.publishedAt))}</time></div>
        <h3><a href="${escapeHtml(storyHref(story.id))}">${escapeHtml(story.title)}</a></h3>
        <p>${escapeHtml(story.deck)}</p>
        <div class="editorial-item-actions">
          <a class="text-action" href="${escapeHtml(storyHref(story.id))}">Read story <i data-lucide="arrow-up-right"></i></a>
          ${publisherUrl ? `<a class="text-action" href="${escapeHtml(publisherUrl)}" target="_blank" rel="noopener noreferrer">Original source <i data-lucide="external-link"></i></a>` : ""}
          <button class="icon-button share-button" type="button" data-share="${escapeHtml(story.id)}" aria-label="Share ${escapeHtml(story.title)}"><i data-lucide="share-2"></i></button>
          <button class="icon-button save-button ${isSaved ? "is-saved" : ""}" type="button" data-save="${escapeHtml(story.id)}" aria-label="${isSaved ? "Remove saved story" : "Save story"}" aria-pressed="${isSaved}"><i data-lucide="bookmark"></i></button>
        </div>
      </div>
    </article>`;
}

function bindNewsImageFallbacks(root = document) {
    root.querySelectorAll("[data-news-image]").forEach((image) => {
      image.onerror = () => {
        image.hidden = true;
        const fallback = image.nextElementSibling;
        if (fallback) fallback.hidden = false;
      };
    });
}

function shareStory(id) {
    const story = [...state.stories, ...state.saved].find((item) => item.id === id);
    if (!story) {
      showToast("This story is no longer available to share");
      return;
    }
    const shareUrl = safeUrl(story.url, true);
    if (!shareUrl) {
      showToast("This story does not have a shareable source link");
      return;
    }
    if (navigator.share) {
      navigator.share({ title: story.title, url: shareUrl })
        .catch((error) => {
          if (error.name !== "AbortError") showToast("Could not share this story");
        });
      return;
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl)
        .then(() => showToast("Story link copied"))
        .catch(() => showToast("Could not copy this story link"));
      return;
    }
    showToast("Sharing is not available in this browser");
}

function render() {
  const query = state.query.trim().toLowerCase();
  const stories = state.view === "saved" ? state.saved : state.stories;
  let visible = stories.filter((story) => !query || `${story.title} ${story.deck} ${story.category} ${story.source} ${story.author}`.toLowerCase().includes(query));
  if (state.sort === "latest") visible = [...visible].sort((left, right) => new Date(right.publishedAt) - new Date(left.publishedAt));
  state.visibleStories = visible;
  const lead = state.view === "saved" ? null : visible[0];
  const leadSection = document.querySelector("#lead-story");
  leadSection.hidden = !lead;
  document.querySelector("#lead-count").textContent = `01 / ${String(visible.length).padStart(2, "0")}`;
  if (lead) {
    document.querySelector("#lead-category").className = `category-tag tag-${lead.color}`;
    document.querySelector("#lead-category").textContent = lead.category.toUpperCase();
    document.querySelector("#lead-time").textContent = formatPublishedAt(lead.publishedAt);
    document.querySelector("#lead-time").title = formatTime(lead.publishedAt);
    document.querySelector("#lead-title").textContent = lead.title;
    document.querySelector("#lead-title").href = storyHref(lead.id);
    document.querySelector("#lead-deck").textContent = lead.deck;
    document.querySelector("#lead-author").textContent = lead.author;
    document.querySelector("#lead-source").textContent = lead.source;
    document.querySelector("#lead-initials").textContent = lead.author.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
    const leadImage = document.querySelector("#lead-image");
    const leadImageFallback = document.querySelector("#lead-image-fallback");
    leadImage.hidden = !lead.image;
    leadImageFallback.hidden = Boolean(lead.image);
    leadImage.alt = lead.title;
    leadImage.onerror = () => {
      leadImage.hidden = true;
      leadImageFallback.hidden = false;
    };
    leadImage.src = lead.image || "";
    document.querySelector("#lead-image-link").href = storyHref(lead.id);
    document.querySelector("#lead-image-link").setAttribute("aria-label", `Read top story: ${lead.title}`);
    document.querySelector("#lead-share").dataset.share = lead.id;
    document.querySelector("#lead-source-link").href = safeUrl(lead.url, true) || "#";
    const leadSave = document.querySelector("#lead-save");
    leadSave.dataset.save = lead.id;
    const isLeadSaved = state.saved.some((story) => story.id === lead.id);
    leadSave.classList.toggle("is-saved", isLeadSaved);
    leadSave.setAttribute("aria-pressed", String(isLeadSaved));
    leadSave.setAttribute("aria-label", isLeadSaved ? "Remove saved top story" : "Save top story");
    document.querySelector("#lead-story").dataset.storyId = lead.id;
  }
  const cardStories = visible.filter((story) => !lead || story.id !== lead.id);
  const newestStories = [...visible].sort((left, right) => new Date(right.publishedAt) - new Date(left.publishedAt));
  const editorialPicks = [];
  const seenPickCategories = new Set();
  for (const story of newestStories) {
    if (editorialPicks.length === 3) break;
    if (!seenPickCategories.has(story.category)) {
      editorialPicks.push(story);
      seenPickCategories.add(story.category);
    }
  }
  for (const story of newestStories) {
    if (editorialPicks.length === 3) break;
    if (!editorialPicks.some((pick) => pick.id === story.id)) editorialPicks.push(story);
  }
  const recommendationTopics = state.topic !== "All" ? [state.topic] : state.favoriteTopics;
  const recommendations = recommendationTopics.length
    ? newestStories.filter((story) => recommendationTopics.includes(story.category)).slice(0, 3)
    : [];

  document.querySelector("#saved-list").innerHTML = visible.map((story) => `
    <article class="saved-story-item">
      <a class="saved-story-image-link" href="${escapeHtml(storyHref(story.id))}" tabindex="-1" aria-hidden="true">
        ${story.image
          ? `<img src="${escapeHtml(story.image)}" alt="" loading="lazy" data-news-image /><span class="image-fallback" hidden><i data-lucide="newspaper"></i><span>Image unavailable</span></span>`
          : '<span class="image-fallback"><i data-lucide="newspaper"></i><span>Image unavailable</span></span>'}
      </a>
      <div class="saved-story-copy">
        <div class="saved-story-meta"><span class="category-tag tag-${story.color}">${escapeHtml(story.category.toUpperCase())}</span><span>${escapeHtml(story.source)}</span><time datetime="${escapeHtml(story.publishedAt || "")}" title="${escapeHtml(formatTime(story.publishedAt))}">${escapeHtml(formatPublishedAt(story.publishedAt))}</time></div>
        <h3><a href="${escapeHtml(storyHref(story.id))}">${escapeHtml(story.title)}</a></h3>
        <p>${escapeHtml(story.deck)}</p>
      </div>
      <button class="saved-story-remove" type="button" data-save="${escapeHtml(story.id)}" aria-label="Remove ${escapeHtml(story.title)} from your reading list"><i data-lucide="bookmark-minus"></i><span>Remove</span></button>
    </article>`).join("");

  grid.innerHTML = cardStories.map((story, index) => {
    const isSaved = state.saved.some((saved) => saved.id === story.id);
    const publisherUrl = safeUrl(story.url, true);
    return `
      <article class="story-card" style="animation-delay:${Math.min(index * 45, 225)}ms">
        <div class="card-image-wrap">
          <a class="card-image-link" href="${escapeHtml(storyHref(story.id))}" aria-label="Read: ${escapeHtml(story.title)}">
            ${story.image
              ? `<img class="card-image" src="${escapeHtml(story.image)}" alt="" loading="lazy" data-news-image /><span class="image-fallback" hidden><i data-lucide="newspaper"></i><span>Image unavailable</span></span>`
              : '<span class="image-fallback"><i data-lucide="newspaper"></i><span>Image unavailable</span></span>'}
          </a>
          <div class="card-actions">
            <button class="icon-button share-button" data-share="${escapeHtml(story.id)}" type="button" aria-label="Share ${escapeHtml(story.title)}"><i data-lucide="share-2"></i></button>
            <button class="icon-button save-button ${isSaved ? "is-saved" : ""}" data-save="${escapeHtml(story.id)}" type="button" aria-label="${isSaved ? "Remove saved story" : "Save story"}" aria-pressed="${isSaved}"><i data-lucide="bookmark"></i></button>
          </div>
        </div>
        <div class="card-copy">
          <div class="card-meta"><span class="category-tag tag-${story.color}">${escapeHtml(story.category.toUpperCase())}</span><span>${escapeHtml(story.source)}</span><time datetime="${escapeHtml(story.publishedAt || "")}" title="${escapeHtml(formatPublishedAt(story.publishedAt))}">${escapeHtml(formatPublishedAt(story.publishedAt))}</time></div>
          <h3><a href="${escapeHtml(storyHref(story.id))}">${escapeHtml(story.title)}</a></h3>
          <p>${escapeHtml(story.deck)}</p>
          <div class="card-footer"><span class="card-author">${escapeHtml(story.author)} · ${story.minutes}</span><a class="card-read" href="${escapeHtml(storyHref(story.id))}">Read story <i data-lucide="arrow-up-right"></i></a>${publisherUrl ? `<a class="card-source" href="${escapeHtml(publisherUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Open original source for ${escapeHtml(story.title)}"><i data-lucide="external-link"></i></a>` : ""}</div>
        </div>
      </article>`;
  }).join("");

  document.querySelector("#editors-section").hidden = state.view === "saved" || editorialPicks.length === 0;
  document.querySelector("#editors-picks").innerHTML = editorialPicks.map(renderEditorialItem).join("");
  document.querySelector("#recommendations-section").hidden = state.view === "saved";
  document.querySelector("#recommendations-list").innerHTML = recommendations.map(renderEditorialItem).join("");
  document.querySelector("#recommendations-empty").hidden = state.view === "saved" || recommendationTopics.length > 0;

  document.querySelector("#story-total").textContent = String(visible.length).padStart(2, "0");
  document.querySelector("#stories-heading-label").textContent = state.view === "saved"
    ? "Your reading list"
    : state.topic === "All" ? "Latest News" : `${state.topic} News`;
  const subtitle = document.querySelector("#welcome-subtitle");
  if (state.view === "saved") {
    subtitle.textContent = "Stories you’ve saved to read later.";
  } else if (state.view === "for-you" && state.topic === "All" && state.favoriteTopics.length) {
    subtitle.textContent = `A thoughtful mix of ${state.favoriteTopics.join(", ")} stories, picked for you.`;
  } else if (state.view === "for-you" && state.topic === "All") {
    subtitle.textContent = "Choose favorite topics to make your daily mix yours.";
  } else {
    subtitle.textContent = "Here’s what’s worth your attention today.";
  }
  document.querySelector("#feed-count").textContent = state.stories.length || "";
  document.querySelector("#saved-count").textContent = state.saved.length || "";
  document.querySelector(".section-heading > div > .eyebrow").textContent = state.view === "saved" ? "BOOKMARKED FOR LATER" : "LATEST NEWS";
  grid.hidden = state.view === "saved" || cardStories.length === 0;
  document.querySelector("#saved-list").hidden = state.view !== "saved" || visible.length === 0;
  document.querySelector("#lead-story").setAttribute("aria-label", lead ? `Featured story: ${lead.title}` : "Featured story");
  emptyState.hidden = state.loading || visible.length > 0;
  const isSavedEmpty = state.view === "saved" && !state.query;
  const hasSearch = Boolean(state.query.trim());
  const hasTopicFilter = state.topic !== "All";
  const emptyTitle = document.querySelector("#empty-state-title");
  const emptyDescription = document.querySelector("#empty-state-description");
  const primaryAction = document.querySelector("#empty-primary");
  if (state.error) {
    emptyTitle.textContent = "News can’t be loaded right now";
    emptyDescription.textContent = navigator.onLine === false
      ? "You appear to be offline. Reconnect to the internet, then try loading the latest stories again."
      : "We couldn’t load the latest news. Check your connection and try again.";
    primaryAction.textContent = "Try Again";
    primaryAction.dataset.action = "retry";
  } else if (isSavedEmpty) {
    emptyTitle.textContent = "Your reading list is ready when you are";
    emptyDescription.textContent = "Save stories that catch your eye and they’ll be waiting here whenever you want to read them.";
    primaryAction.textContent = "Explore Latest Stories";
    primaryAction.dataset.action = "latest";
  } else if (state.view === "saved") {
    emptyTitle.textContent = "No saved stories match your search";
    emptyDescription.textContent = "Try another keyword or browse the latest stories to find something to save.";
    primaryAction.textContent = "Explore Latest Stories";
    primaryAction.dataset.action = "latest";
  } else if (hasSearch) {
    emptyTitle.textContent = "No stories match your search";
    emptyDescription.textContent = "We couldn’t find any articles matching your current search. Try another keyword or explore the latest stories.";
    primaryAction.textContent = "Explore Latest Stories";
    primaryAction.dataset.action = "latest";
  } else if (hasTopicFilter) {
    emptyTitle.textContent = `No ${state.topic} stories right now`;
    emptyDescription.textContent = "There are currently no articles in this category. Explore another topic or view the latest stories.";
    primaryAction.textContent = "Explore Latest Stories";
    primaryAction.dataset.action = "latest";
  } else {
    emptyTitle.textContent = "No stories are available right now";
    emptyDescription.textContent = "There aren’t any headlines to show at the moment. Try again shortly or explore another topic.";
    primaryAction.textContent = "Try Again";
    primaryAction.dataset.action = "retry";
  }
  document.querySelector("#clear-search").hidden = !hasSearch || Boolean(state.error);
  document.querySelector("#clear-topic-filter").hidden = !hasTopicFilter || Boolean(state.error);
  document.querySelector("#empty-discovery").hidden = Boolean(state.error);
  feedMessage.hidden = !state.loading;
  feedMessage.classList.remove("is-error");
  feedMessageText.textContent = state.loading ? "Fetching the latest headlines…" : "";
  updateBriefingControls();
  document.querySelector("#briefing-list").innerHTML = newestStories.slice(0, 3).map((story, index) => `<li><span class="brief-number">${String(index + 1).padStart(2, "0")}</span><a href="${escapeHtml(storyHref(story.id))}"><strong>${escapeHtml(story.title)}</strong><small>${escapeHtml(story.source)} · ${escapeHtml(formatPublishedAt(story.publishedAt))}</small></a></li>`).join("");
  document.querySelector("#more-headlines").innerHTML = newestStories.slice(0, 3).map((story, index) => `<a href="${escapeHtml(storyHref(story.id))}" class="most-read-item"><span class="rank">${String(index + 1).padStart(2, "0")}</span><span><strong>${escapeHtml(story.title)}</strong><small>${escapeHtml(story.source)} · ${escapeHtml(formatPublishedAt(story.publishedAt))}</small></span></a>`).join("");
  document.querySelector("#briefing-empty").hidden = state.loading || Boolean(state.error) || newestStories.length > 0;
  document.querySelector("#trending-empty").hidden = state.loading || Boolean(state.error) || newestStories.length > 0;
  bindNewsImageFallbacks();
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("is-active", button.dataset.view === state.view));
  document.querySelectorAll(".topic-item").forEach((button) => {
    const isActive = button.dataset.topic === state.topic;
    const isFavorite = state.favoriteTopics.includes(button.dataset.topic);
    button.classList.toggle("is-active", isActive);
    button.classList.toggle("is-favorite", isFavorite);
    button.setAttribute("aria-pressed", String(isActive));
    button.querySelector(".favorite-indicator")?.remove();
    if (button.dataset.topic !== "All") {
      button.setAttribute("aria-label", `${button.dataset.topic}${isFavorite ? ", favorite topic" : ""}`);
      if (isFavorite) {
        const indicator = document.createElement("span");
        indicator.className = "favorite-indicator";
        indicator.setAttribute("aria-hidden", "true");
        indicator.title = "Preferred topic";
        indicator.innerHTML = '<i data-lucide="bookmark-check" aria-hidden="true"></i>';
        button.append(indicator);
      }
    }
  });
  if (window.lucide) window.lucide.createIcons();
  renderRoute();
}

async function fetchStories() {
  const requestId = ++state.requestId;
  state.loading = true;
  state.error = "";
  render();
  const useFavorites = state.view === "for-you" && state.topic === "All" && state.favoriteTopics.length > 0;
  const parameters = new URLSearchParams({ country: state.country });
  if (useFavorites) {
    parameters.set("categories", state.favoriteTopics.map((topic) => topicCategories[topic]).join(","));
  } else {
    parameters.set("category", topicCategories[state.topic] || "general");
  }
  if (state.query.trim()) parameters.set("q", state.query.trim());
  try {
    const response = await fetch(`/api/news?${parameters.toString()}`);
    if (!response.headers.get("content-type")?.includes("application/json")) {
      throw new Error("The news API endpoint did not return JSON. Start the app with `python3 server.py` instead of a static file server.");
    }
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || "Could not fetch headlines.");
    if (requestId !== state.requestId) return;
    state.stories = (payload.articles || []).map((article) => normalizeArticle(article)).filter(Boolean);
  } catch (error) {
    if (requestId !== state.requestId) return;
    state.stories = [];
    state.error = error.message || "Could not fetch headlines. Try again.";
  } finally {
    if (requestId === state.requestId) {
      state.loading = false;
      render();
    }
  }
}

function saveStory(id) {
  const existingIndex = state.saved.findIndex((story) => story.id === id);
  const story = [...state.stories, ...state.saved, state.activeStory].filter(Boolean).find((item) => item.id === id);
  if (existingIndex === -1 && !story) return;
  const nextSaved = existingIndex !== -1
    ? state.saved.filter((item) => item.id !== id)
    : [story, ...state.saved].slice(0, 100);
  try {
    localStorage.setItem("signal-saved-stories", JSON.stringify(nextSaved));
  } catch {
    showToast("Could not update your reading list in this browser");
    return;
  }
  state.saved = nextSaved;
  showToast(existingIndex !== -1 ? "Removed from your reading list" : "Saved to read later");
  render();
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 1900);
}

function updateBriefingControls() {
  const button = document.querySelector("#briefing-button");
  const stopButton = document.querySelector("#briefing-stop");
  const label = document.querySelector("#briefing-button-label");
  const icon = document.querySelector("#briefing-toggle-icon");
  const isPlaying = briefingState === "speaking";
  const isPaused = briefingState === "paused";
  label.textContent = isPlaying ? "Pause briefing" : isPaused ? "Resume briefing" : "Listen to briefing";
  button.setAttribute("aria-label", isPlaying ? "Pause today's headlines" : isPaused ? "Resume today's headlines" : "Listen to today's headlines");
  button.setAttribute("aria-pressed", String(isPlaying || isPaused));
  icon.setAttribute("data-lucide", isPlaying ? "pause" : "play");
  stopButton.hidden = briefingState === "idle";
  if (window.lucide) window.lucide.createIcons();
}

function stopBriefing(notify = false) {
  const wasActive = briefingState !== "idle";
  briefingState = "idle";
  briefingUtterance = null;
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  updateBriefingControls();
  if (notify && wasActive) showToast("Briefing stopped");
}

function toggleBriefing() {
  if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
    showToast("Audio playback is not supported in this browser");
    return;
  }
  if (briefingState === "speaking") {
    window.speechSynthesis.pause();
    briefingState = "paused";
    updateBriefingControls();
    showToast("Briefing paused");
    return;
  }
  if (briefingState === "paused") {
    window.speechSynthesis.resume();
    briefingState = "speaking";
    updateBriefingControls();
    showToast("Briefing resumed");
    return;
  }

  const stories = state.visibleStories.slice(0, 5);
  if (stories.length === 0) {
    showToast("There are no headlines to read yet");
    return;
  }
  const introduction = "Here is your Mirsal daily briefing.";
  const narration = stories.map((story, index) => {
    const summary = story.deck === "Open the full story for more details." ? "" : story.deck;
    return `Story ${index + 1}, ${story.title}. ${summary} From ${story.source}.`;
  }).join(" ");
  briefingUtterance = new SpeechSynthesisUtterance(`${introduction} ${narration}`);
  briefingUtterance.lang = navigator.language || "en-US";
  briefingUtterance.rate = 0.96;
  briefingUtterance.onend = () => {
    briefingState = "idle";
    briefingUtterance = null;
    updateBriefingControls();
    showToast("Briefing complete");
  };
  briefingUtterance.onerror = (event) => {
    if (briefingState === "idle" || event.error === "canceled" || event.error === "interrupted") return;
    briefingState = "idle";
    briefingUtterance = null;
    updateBriefingControls();
    showToast("Could not play the briefing");
  };
  briefingState = "speaking";
  updateBriefingControls();
  try {
    window.speechSynthesis.speak(briefingUtterance);
  } catch {
    stopBriefing();
    showToast("Could not play the briefing");
  }
}

function storyIdFromHash() {
  if (!location.hash.startsWith("#story?")) return "";
  return safeUrl(new URLSearchParams(location.hash.slice("#story?".length)).get("url"), true);
}

function cachedStory(id) {
  try {
    const story = JSON.parse(sessionStorage.getItem(`signal-story:${id}`) || "null");
    if (!story || story.id !== id || story.url !== id || typeof story.title !== "string") return null;
    return {
      ...story,
      url: safeUrl(story.url, true),
      image: safeUrl(story.image),
      deck: typeof story.deck === "string" ? story.deck : "",
      source: typeof story.source === "string" ? story.source : "News source",
      author: typeof story.author === "string" ? story.author : "News desk"
    };
  } catch {
    return null;
  }
}

function findStory(id) {
  return [...state.stories, ...state.saved].find((item) => item.id === id) || cachedStory(id);
}

function renderArticle(story) {
  const articlePage = document.querySelector("#article-page");
  const articleContent = document.querySelector("#article-content");
  const unavailable = document.querySelector("#article-unavailable");
  unavailable.hidden = true;
  articleContent.hidden = false;
  document.querySelector("#article-category").className = `category-tag tag-${story.color}`;
  document.querySelector("#article-category").textContent = story.category.toUpperCase();
  document.querySelector("#article-title").textContent = story.title;
  document.querySelector("#article-deck").textContent = story.deck;
  document.querySelector("#article-initials").textContent = story.author.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  document.querySelector("#article-author").textContent = story.author;
  document.querySelector("#article-source").textContent = story.source;
  document.querySelector("#article-source-note").textContent = story.source;
  document.querySelector("#article-time").textContent = formatPublishedAt(story.publishedAt);
  document.querySelector("#article-time").title = formatTime(story.publishedAt).toLowerCase();
  document.querySelector("#article-time").dateTime = story.publishedAt || "";
  document.querySelector("#article-summary").textContent = story.deck;
  document.querySelector("#article-source-link").href = story.url;
  document.querySelector("#article-caption").textContent = story.source;
  const image = document.querySelector("#article-image");
  image.alt = story.title;
  const imageFallback = document.querySelector("#article-image-fallback");
  image.hidden = !story.image;
  imageFallback.hidden = Boolean(story.image);
  image.onerror = () => {
    image.hidden = true;
    imageFallback.hidden = false;
  };
  image.src = story.image || "";
  document.querySelector("#article-hero").hidden = false;
  document.querySelector("#article-caption").textContent = story.image ? story.source : "Publisher image unavailable";
  bindNewsImageFallbacks(articleContent);

  const isSaved = state.saved.some((item) => item.id === story.id);
  const saveButton = document.querySelector("#article-save");
  saveButton.dataset.save = story.id;
  saveButton.classList.toggle("is-saved", isSaved);
  saveButton.setAttribute("aria-pressed", String(isSaved));
  saveButton.querySelector("span").textContent = isSaved ? "Saved" : "Save";
  saveButton.setAttribute("aria-label", isSaved ? "Remove from saved stories" : "Save story");

  const related = state.stories.filter((item) => item.id !== story.id)
    .sort((left, right) => Number(right.category === story.category) - Number(left.category === story.category))
    .slice(0, 3);
  document.querySelector(".article-related").hidden = related.length === 0;
  document.querySelector("#article-related-grid").innerHTML = related.map((item) => `
    <a class="article-related-card" href="${escapeHtml(storyHref(item.id))}">
      ${item.image ? `<img src="${escapeHtml(item.image)}" alt="" loading="lazy" data-news-image /><span class="image-fallback" hidden><i data-lucide="newspaper"></i><span>Image unavailable</span></span>` : '<span class="image-fallback"><i data-lucide="newspaper"></i><span>Image unavailable</span></span>'}
      <span class="category-tag tag-${item.color}">${escapeHtml(item.category.toUpperCase())}</span>
      <strong>${escapeHtml(item.title)}</strong>
      <small>${escapeHtml(item.source)} · ${escapeHtml(formatPublishedAt(item.publishedAt))}</small>
    </a>`).join("");
    bindNewsImageFallbacks(document.querySelector("#article-related-grid"));
  document.title = `${story.title} — Mirsal`;
  articlePage.hidden = false;
  if (window.lucide) window.lucide.createIcons();
}

function renderRoute() {
  const shell = document.querySelector(".app-shell");
  const articlePage = document.querySelector("#article-page");
  const id = storyIdFromHash();
  if (!id) {
    state.activeStory = null;
    shell.hidden = false;
    articlePage.hidden = true;
    document.title = "Mirsal — your daily briefing";
    return;
  }

  shell.hidden = true;
  articlePage.hidden = false;
  const story = findStory(id);
  if (!story) {
    state.activeStory = null;
    document.querySelector("#article-content").hidden = true;
    const unavailable = document.querySelector("#article-unavailable");
    unavailable.textContent = state.loading
      ? "Loading this story from the current edition…"
      : "This story is no longer available in the current edition. Return to the edition and choose another story.";
    unavailable.hidden = false;
    document.title = "Story unavailable — Mirsal";
    return;
  }
  state.activeStory = story;
  renderArticle(story);
}

function openStory(id) {
  const story = findStory(id);
  if (!story) return;
  state.activeStory = story;
  try {
    sessionStorage.setItem(`signal-story:${story.id}`, JSON.stringify(story));
  } catch {
    showToast("This story will stay available while this edition is open");
  }
  history.pushState({ signalArticle: true }, "", storyHref(story.id));
  renderRoute();
  window.scrollTo(0, 0);
  document.querySelector("#article-title").focus({ preventScroll: true });
}

function returnToEdition() {
  if (history.state?.signalArticle) {
    history.back();
    return;
  }
  history.replaceState(null, "", "#top");
  renderRoute();
}

function openTopicsDialog() {
  document.querySelectorAll('input[name="favorite-topic"]').forEach((input) => {
    input.checked = state.favoriteTopics.includes(input.value);
  });
  topicsDialog.showModal();
}

const today = new Date();
document.querySelector("#edition-date").textContent = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(today).toUpperCase();
const profileButton = document.querySelector("#profile-button");
const profileMenu = document.querySelector("#profile-menu");
profileButton.addEventListener("click", () => {
  const isOpening = profileMenu.hidden;
  profileMenu.hidden = !isOpening;
  profileButton.setAttribute("aria-expanded", String(isOpening));
});
profileMenu.addEventListener("click", (event) => {
  const action = event.target.closest("[data-profile-action]")?.dataset.profileAction;
  if (!action) return;
  profileMenu.hidden = true;
  profileButton.setAttribute("aria-expanded", "false");
  if (action === "saved") document.querySelector('.nav-item[data-view="saved"]').click();
  if (action === "topics") openTopicsDialog();
});
document.addEventListener("click", (event) => {
  if (!profileMenu.hidden && !profileMenu.contains(event.target) && !profileButton.contains(event.target)) {
    profileMenu.hidden = true;
    profileButton.setAttribute("aria-expanded", "false");
  }
});
document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => {
  stopBriefing();
  if (storyIdFromHash()) {
    history.replaceState(null, "", "#top");
    state.activeStory = null;
  }
  state.view = button.dataset.view;
  if (state.view === "saved") { state.loading = false; state.error = ""; render(); }
  else {
    state.sort = state.view === "latest" ? "latest" : "recommended";
    if (state.view === "for-you") state.topic = "All";
    document.querySelector("#sort-select").value = state.sort;
    fetchStories();
  }
}));
document.querySelectorAll(".topic-item").forEach((button) => button.addEventListener("click", () => { stopBriefing(); state.topic = button.dataset.topic; state.view = "for-you"; fetchStories(); }));
document.querySelector("#manage-topics").addEventListener("click", openTopicsDialog);
document.querySelector("#topics-dialog-close").addEventListener("click", () => topicsDialog.close());
document.querySelector("#topics-cancel").addEventListener("click", () => topicsDialog.close());
document.querySelector("#topics-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const favoriteTopics = [...document.querySelectorAll('input[name="favorite-topic"]:checked')].map((input) => input.value);
  try {
    localStorage.setItem("signal-favorite-topics", JSON.stringify(favoriteTopics));
  } catch {
    showToast("Could not save your topics in this browser");
    return;
  }
  state.favoriteTopics = favoriteTopics;
  state.topic = "All";
  state.view = "for-you";
  document.querySelector("#sort-select").value = "recommended";
  topicsDialog.close();
  fetchStories();
});
searchInput.addEventListener("input", () => {
  state.query = searchInput.value;
  if (state.view === "saved") { render(); return; }
  clearTimeout(searchTimer);
  searchTimer = setTimeout(fetchStories, 350);
});
document.querySelector("#country-select").addEventListener("change", (event) => { state.country = event.target.value; fetchStories(); });
document.querySelector("#sort-select").addEventListener("change", (event) => { state.sort = event.target.value; render(); });
document.addEventListener("click", (event) => {
  const shareButton = event.target.closest("[data-share]");
  if (shareButton) {
    event.preventDefault();
    shareStory(shareButton.dataset.share);
    return;
  }
  const saveButton = event.target.closest("[data-save]");
  if (saveButton) {
    event.preventDefault();
    saveStory(saveButton.dataset.save);
    return;
  }
  const storyLink = event.target.closest('a[href^="#story?"]');
  if (!storyLink) return;
  event.preventDefault();
  const id = safeUrl(new URLSearchParams(storyLink.hash.slice("#story?".length)).get("url"), true);
  if (id) {
    stopBriefing();
    openStory(id);
  }
});
document.querySelector("#article-back").addEventListener("click", returnToEdition);
document.querySelector("#briefing-button").addEventListener("click", toggleBriefing);
document.querySelector("#briefing-stop").addEventListener("click", () => stopBriefing(true));
document.querySelector("#article-share").addEventListener("click", async () => {
  if (!state.activeStory) return;
  try {
    if (navigator.share) {
      await navigator.share({ title: state.activeStory.title, url: location.href });
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(location.href);
      showToast("Story link copied");
    } else {
      showToast("Sharing is not available in this browser");
    }
  } catch (error) {
    if (error.name !== "AbortError") showToast("Could not share this story");
  }
});
document.querySelector("#empty-primary").addEventListener("click", (event) => {
  if (event.currentTarget.dataset.action === "retry") {
    fetchStories();
    return;
  }
  state.topic = "All";
  state.query = "";
  state.view = "latest";
  state.sort = "latest";
  searchInput.value = "";
  document.querySelector("#sort-select").value = state.sort;
  fetchStories();
});
document.querySelector("#clear-search").addEventListener("click", () => {
  state.query = "";
  searchInput.value = "";
  if (state.view === "saved") render();
  else fetchStories();
});
document.querySelector("#clear-topic-filter").addEventListener("click", () => {
  state.topic = "All";
  if (state.view === "saved") render();
  else fetchStories();
});
document.querySelectorAll("[data-empty-topic]").forEach((button) => button.addEventListener("click", () => {
  state.topic = button.dataset.emptyTopic;
  state.query = "";
  state.view = "for-you";
  searchInput.value = "";
  document.querySelector("#sort-select").value = "recommended";
  state.sort = "recommended";
  fetchStories();
}));
document.querySelector("#read-briefing").addEventListener("click", () => document.querySelector("#stories-heading").scrollIntoView({ behavior: "smooth" }));
document.querySelector("#recommend-topics").addEventListener("click", openTopicsDialog);
window.addEventListener("popstate", renderRoute);
window.addEventListener("hashchange", renderRoute);
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); searchInput.focus(); }
  if (event.key === "Escape" && topicsDialog.open) {
    topicsDialog.close();
  }
  if (event.key === "Escape" && !profileMenu.hidden) {
    profileMenu.hidden = true;
    profileButton.setAttribute("aria-expanded", "false");
    profileButton.focus();
  }
});

render();
fetchStories();