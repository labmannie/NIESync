import { describe, it, expect } from "vitest";
import {
  isPublicRoute,
  isGuestOnlyRoute,
  resolveUserType,
  isProfileComplete,
} from "../lib/authGating";

describe("isPublicRoute", () => {
  it("treats the home page as public", () => {
    expect(isPublicRoute("/")).toBe(true);
  });

  it("treats auth and marketing pages as public", () => {
    expect(isPublicRoute("/login")).toBe(true);
    expect(isPublicRoute("/signup")).toBe(true);
    expect(isPublicRoute("/about")).toBe(true);
    expect(isPublicRoute("/resolve/abc123/token")).toBe(true);
  });

  it("does not treat authenticated app routes as public", () => {
    expect(isPublicRoute("/parking-patrol")).toBe(false);
    expect(isPublicRoute("/forum")).toBe(false);
    expect(isPublicRoute("/lost-and-found")).toBe(false);
    expect(isPublicRoute("/profile")).toBe(false);
  });

  it("does not accidentally match unrelated routes with similar prefixes", () => {
    // Regression guard: prefix matching must not match app routes that merely
    // start with a similar-looking string, e.g. a hypothetical "/aboutus" page.
    expect(isPublicRoute("/forumsomethingelse")).toBe(false);
  });
});

describe("isGuestOnlyRoute", () => {
  it("flags login and signup as guest-only", () => {
    expect(isGuestOnlyRoute("/login")).toBe(true);
    expect(isGuestOnlyRoute("/signup")).toBe(true);
  });

  it("does not flag the signup completion page as guest-only", () => {
    expect(isGuestOnlyRoute("/signup/complete")).toBe(false);
  });

  it("does not flag unrelated routes", () => {
    expect(isGuestOnlyRoute("/forum")).toBe(false);
  });
});

describe("resolveUserType", () => {
  it("prefers an explicit user_type", () => {
    expect(resolveUserType({ user_type: "Faculty", role: "Student" })).toBe("Faculty");
  });

  it("falls back to role when user_type is unset", () => {
    expect(resolveUserType({ user_type: null, role: "Faculty" })).toBe("Faculty");
  });

  it("defaults to Student when neither is Faculty", () => {
    expect(resolveUserType({ user_type: null, role: null })).toBe("Student");
  });
});

describe("isProfileComplete", () => {
  it("is complete for a student with a USN and no vehicle", () => {
    expect(
      isProfileComplete({ user_type: "Student", usn: "4NI21CS001", has_vehicle: false }, false)
    ).toBe(true);
  });

  it("is incomplete for a student missing a USN", () => {
    expect(isProfileComplete({ user_type: "Student", usn: "", has_vehicle: false }, false)).toBe(false);
  });

  it("is incomplete for a student with only whitespace as a USN", () => {
    expect(isProfileComplete({ user_type: "Student", usn: "   ", has_vehicle: false }, false)).toBe(
      false
    );
  });

  it("does not require a USN for faculty", () => {
    expect(isProfileComplete({ user_type: "Faculty", usn: null, has_vehicle: false }, false)).toBe(true);
  });

  it("is incomplete when has_vehicle is true but no vehicle is on file", () => {
    expect(
      isProfileComplete({ user_type: "Student", usn: "4NI21CS001", has_vehicle: true, vehicle_no: null }, false)
    ).toBe(false);
  });

  it("is complete when has_vehicle is true and a vehicle_no is denormalized on the profile", () => {
    expect(
      isProfileComplete(
        { user_type: "Student", usn: "4NI21CS001", has_vehicle: true, vehicle_no: "KA51AB1234" },
        false
      )
    ).toBe(true);
  });

  it("is complete when has_vehicle is true and hasAnyVehicle is confirmed separately", () => {
    expect(
      isProfileComplete({ user_type: "Student", usn: "4NI21CS001", has_vehicle: true, vehicle_no: null }, true)
    ).toBe(true);
  });

  it("does not require a vehicle when has_vehicle is false", () => {
    expect(
      isProfileComplete({ user_type: "Student", usn: "4NI21CS001", has_vehicle: false, vehicle_no: null }, false)
    ).toBe(true);
  });
});
