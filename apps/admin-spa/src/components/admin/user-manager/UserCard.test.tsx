import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { UserCard } from "./UserCard";

describe("UserCard Avatar & CLS Performance Audit", () => {
  const mockUserWithAvatar = {
    id: "user-1",
    name: "Trần Thị B",
    email: "tranthib@limart.com",
    role: "USER",
    employmentType: "FULL_TIME",
    isActive: true,
    image: "https://lh3.googleusercontent.com/a/ACg8ocI-sample-avatar",
    hourlyRate: 25000,
    monthlySalary: 6000000,
  };

  const mockUserWithoutAvatar = {
    id: "user-2",
    name: "Lê Văn C",
    email: "levanc@limart.com",
    role: "USER",
    employmentType: "PART_TIME",
    isActive: true,
    image: null,
    hourlyRate: 25000,
    monthlySalary: 0,
  };

  it("renders user avatar with explicit width, height, loading=lazy, and decoding=async to prevent CLS", () => {
    render(
      <MemoryRouter>
        <UserCard user={mockUserWithAvatar} />
      </MemoryRouter>
    );

    const img = screen.getByRole("img", { name: "Trần Thị B" });
    expect(img).toBeDefined();
    expect(img.getAttribute("src")).toBe("https://lh3.googleusercontent.com/a/ACg8ocI-sample-avatar");
    expect(img.getAttribute("width")).toBe("40");
    expect(img.getAttribute("height")).toBe("40");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("decoding")).toBe("async");
  });

  it("gracefully falls back to /icons/capy_dashboard.webp when avatar fails to load via onError", () => {
    render(
      <MemoryRouter>
        <UserCard user={mockUserWithAvatar} />
      </MemoryRouter>
    );

    const img = screen.getByRole("img", { name: "Trần Thị B" }) as HTMLImageElement;
    fireEvent.error(img);

    expect(img.src).toContain("/icons/capy_dashboard.webp");
  });

  it("renders user initials when image is null without rendering any img tag", () => {
    render(
      <MemoryRouter>
        <UserCard user={mockUserWithoutAvatar} />
      </MemoryRouter>
    );

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("L")).toBeDefined();
  });

  it("renders question mark fallback when both image and name are empty", () => {
    const anonymousUser = {
      id: "user-3",
      name: "",
      email: "anon@limart.com",
      role: "USER",
      employmentType: "PART_TIME",
      isActive: true,
      image: null,
    };

    render(
      <MemoryRouter>
        <UserCard user={anonymousUser} />
      </MemoryRouter>
    );

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("?")).toBeDefined();
  });
});
