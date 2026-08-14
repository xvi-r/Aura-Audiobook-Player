// Simple Hash-Based Router for Single Page Application

class Router {
  constructor() {
    this.routes = {};
    window.addEventListener("hashchange", () => this.handleRoute());
  }

  addRoute(path, callback) {
    this.routes[path] = callback;
  }

  navigate(hash) {
    if (window.location.hash === hash) {
      // Hash won't change, so hashchange won't fire — force-trigger the route handler
      this.handleRoute();
    } else {
      window.location.hash = hash;
    }
  }

  handleRoute() {
    const hash = window.location.hash || "#library";
    
    // Check for book details route: #book/book-id-here
    if (hash.startsWith("#book/")) {
      const bookId = hash.replace("#book/", "");
      if (this.routes["#book"]) {
        this.routes["#book"](bookId);
      }
      return;
    }

    // Check for ebook details route: #ebook/ebook-id-here
    if (hash.startsWith("#ebook/")) {
      const ebookId = hash.replace("#ebook/", "");
      if (this.routes["#ebook"]) {
        this.routes["#ebook"](ebookId);
      }
      return;
    }

    // Check for collections sub-route: #collections/collection-name
    if (hash.startsWith("#collections/")) {
      const collectionName = decodeURIComponent(hash.replace("#collections/", ""));
      if (this.routes["#collections"]) {
        this.routes["#collections"](collectionName);
      }
      return;
    }

    // Default routes
    if (this.routes[hash]) {
      this.routes[hash]();
    } else {
      // Fallback to library
      this.navigate("#library");
    }
  }

  init() {
    this.handleRoute();
  }
}

export const router = new Router();
