import React, { createContext, useContext, useState, useEffect } from "react";

interface RouterContextType {
  pathname: string;
  push: (path: string) => void;
  replace: (path: string) => void;
  refresh: () => void;
}

const RouterContext = createContext<RouterContextType>({
  pathname: "/",
  push: () => {},
  replace: () => {},
  refresh: () => {},
});

export const RouterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pathname, setPathname] = useState<string>(() =>
    typeof window !== "undefined" ? window.location.pathname || "/" : "/"
  );

  useEffect(() => {
    const handlePop = () => {
      setPathname(window.location.pathname || "/");
    };
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, []);

  const push = (path: string) => {
    if (typeof window !== "undefined") {
      window.history.pushState(null, "", path);
      setPathname(path.split("?")[0] || "/");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const replace = (path: string) => {
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", path);
      setPathname(path.split("?")[0] || "/");
    }
  };

  const refresh = () => {
    setPathname(window.location.pathname || "/");
  };

  return (
    <RouterContext.Provider value={{ pathname, push, replace, refresh }}>
      {children}
    </RouterContext.Provider>
  );
};

export const useRouter = () => {
  const ctx = useContext(RouterContext);
  return {
    push: ctx.push,
    replace: ctx.replace,
    refresh: ctx.refresh,
  };
};

export const usePathname = () => {
  const ctx = useContext(RouterContext);
  return ctx.pathname;
};

export interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href?: string;
  to?: string;
  children: React.ReactNode;
}

export const Link: React.FC<LinkProps> = ({ href, to, children, className, onClick, ...rest }) => {
  const router = useRouter();
  const target = to || href || "/";

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // If opening in new tab or external link, allow normal behavior
    if (
      e.ctrlKey ||
      e.metaKey ||
      e.shiftKey ||
      e.altKey ||
      target.startsWith("http://") ||
      target.startsWith("https://")
    ) {
      if (onClick) onClick(e);
      return;
    }

    e.preventDefault();
    if (onClick) onClick(e);
    router.push(target);
  };

  return (
    <a href={target} onClick={handleClick} className={className} {...rest}>
      {children}
    </a>
  );
};

export default Link;
