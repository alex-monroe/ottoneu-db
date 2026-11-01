/**
 * The live game page refresh: once a minute while the tab is visible, paused
 * while hidden, caught up as soon as the tab comes back.
 */
import "@testing-library/jest-dom";
import { act, render, screen } from "@testing-library/react";
import LiveRefresh from "@/components/LiveRefresh";

const refresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh, replace: jest.fn() }),
}));

let visibility: DocumentVisibilityState = "visible";
Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });

function setVisibility(state: DocumentVisibilityState) {
  visibility = state;
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  jest.useFakeTimers();
  refresh.mockClear();
  visibility = "visible";
});

afterEach(() => {
  jest.useRealTimers();
});

describe("LiveRefresh", () => {
  it("says the page is live", () => {
    render(<LiveRefresh seconds={60} />);
    expect(screen.getByRole("status")).toHaveTextContent("Live · this page updates every minute");
  });

  it("refreshes every period while visible", () => {
    render(<LiveRefresh seconds={60} />);
    act(() => jest.advanceTimersByTime(59_000));
    expect(refresh).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1_000));
    expect(refresh).toHaveBeenCalledTimes(1);
    act(() => jest.advanceTimersByTime(120_000));
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("pauses while hidden and catches up when shown", () => {
    render(<LiveRefresh seconds={60} />);
    setVisibility("hidden");
    act(() => jest.advanceTimersByTime(180_000));
    expect(refresh).not.toHaveBeenCalled();
    act(() => setVisibility("visible"));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not refresh on a quick tab switch", () => {
    render(<LiveRefresh seconds={60} />);
    setVisibility("hidden");
    act(() => jest.advanceTimersByTime(10_000));
    act(() => setVisibility("visible"));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("stops when unmounted", () => {
    const { unmount } = render(<LiveRefresh seconds={60} />);
    unmount();
    act(() => jest.advanceTimersByTime(120_000));
    expect(refresh).not.toHaveBeenCalled();
  });
});
