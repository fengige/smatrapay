import { describe, expect, it, vi } from "vitest";
import { residentAvatarSource } from "../resident-avatar";
import { residentAvatarUrls } from "../resident-avatar.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const id = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const path = `${id}/profile/${other}.png`;

describe("resident avatar source security", () => {
  it("uses the existing resident's own private photo path", () => expect(residentAvatarSource(path, id)).toEqual({ path }));
  it("rejects another resident's photo reference", () => expect(residentAvatarSource(path, other)).toBeNull());
  it("rejects traversal paths", () => expect(residentAvatarSource(`${id}/profile/../private.png`, id)).toBeNull());
  it("rejects unsafe and invalid image URLs", () => {
    for (const value of ["javascript:alert(1)", "http://example.com/a.png", "https://", "https://user:password@example.com/a.png"]) expect(residentAvatarSource(value, id)).toBeNull();
  });
  it("preserves existing HTTPS photo URLs", () => expect(residentAvatarSource("https://example.com/a.png", id)).toEqual({ url: "https://example.com/a.png" }));
  it("uses the default avatar when missing", () => expect(residentAvatarSource(null, id)).toBeNull());
});

describe("authorized photo resolution", () => {
  it("signs each unique path once for ten minutes and never signs foreign paths", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://photos.example.com");
    const sign = vi.fn().mockResolvedValue({ data: [{ path, signedUrl: "https://example.com/signed.png" }] });
    const client = { storage: { from: vi.fn().mockReturnValue({ createSignedUrls: sign }) } } as unknown as SupabaseClient<Database>;
    const urls = await residentAvatarUrls([{ id, profile_image: path }, { id, profile_image: path }, { id: other, profile_image: path }], client);
    expect(sign).toHaveBeenCalledExactlyOnceWith([path], 600);
    expect(urls.get(id)).toBe("https://photos.example.com/signed.png");
    expect(urls.get(other)).toBeNull();
    vi.unstubAllEnvs();
  });
  it("falls back without failing resident reads when storage is unavailable", async () => {
    const client = { storage: { from: () => ({ createSignedUrls: async () => { throw new Error("Unavailable"); } }) } } as unknown as SupabaseClient<Database>;
    expect((await residentAvatarUrls([{ id, profile_image: path }], client)).get(id)).toBeNull();
  });
});