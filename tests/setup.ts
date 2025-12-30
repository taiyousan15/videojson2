import "@testing-library/jest-dom/vitest";
import { beforeAll, afterAll, afterEach, vi } from "vitest";

// Mock Next.js navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

// Mock next-auth
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve({ user: { id: "test-user-id", email: "test@example.com" } })),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

// Reset mocks after each test
afterEach(() => {
  vi.clearAllMocks();
});

// Global test timeout
beforeAll(() => {
  vi.setConfig({ testTimeout: 10000 });
});

afterAll(() => {
  vi.restoreAllMocks();
});
