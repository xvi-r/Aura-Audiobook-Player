// HTML5 History API Router for Single Page Application
class Router {
  constructor() {
    this.routes = {};
    this.guard = null;
    window.addEventListener("popstate", () => this.handleRoute());
    window.addEventListener("hashchange", () => this.handleRoute());
  }

  setGuard(guardFn) {
    this.guard = guardFn;
  }

  addRoute(path, callback) {
    const cleanPath = path.startsWith("#") ? "/" + path.slice(1) : path;
    this.routes[cleanPath] = callback;
    this.routes[path] = callback;
  }

  navigate(path) {
    const cleanPath = path.startsWith("#") ? "/" + path.slice(1) : path;
    if (window.location.pathname === cleanPath && !window.location.hash) {
      this.handleRoute();
    } else {
      if (window.location.hash) {
        window.history.replaceState(null, "", cleanPath);
      } else {
        window.history.pushState(null, "", cleanPath);
      }
      this.handleRoute();
    }
  }

  handleRoute() {
    if (window.location.hash) {
      const hashPath = "/" + window.location.hash.slice(1);
      window.history.replaceState(null, "", hashPath);
    }

    let path = window.location.pathname || "/library";
    if (path === "/" || path === "") {
      path = "/library";
    }

    // Execute route authentication/permission guard
    if (this.guard) {
      const redirected = this.guard(path);
      if (redirected && redirected !== path) {
        this.navigate(redirected);
        return;
      }
    }

    // Check for book details route: /book/book-id-here
    if (path.startsWith("/book/")) {
      const bookId = path.replace("/book/", "");
      if (this.routes["/book"]) {
        this.routes["/book"](bookId);
      }
      return;
    }

    // Check for ebook details route: /ebook/ebook-id-here
    if (path.startsWith("/ebook/")) {
      const ebookId = path.replace("/ebook/", "");
      if (this.routes["/ebook"]) {
        this.routes["/ebook"](ebookId);
      }
      return;
    }

    // Check for collections sub-route: /collections/collection-name
    if (path.startsWith("/collections/")) {
      const collectionName = decodeURIComponent(path.replace("/collections/", ""));
      if (this.routes["/collections"]) {
        this.routes["/collections"](collectionName);
      }
      return;
    }

    // Default routes
    if (this.routes[path]) {
      this.routes[path]();
    } else {
      // Fallback
      if (this.guard) {
        const redirected = this.guard("/library");
        this.navigate(redirected || "/library");
      } else {
        this.navigate("/library");
      }
    }
  }

  init() {
    this.handleRoute();
  }
}

export const router = new Router();