import { runPhotoMigration } from './imageService';

export async function runGlobalBase64Migration(userId: string) {
  if (!userId) return;
  try {
    const report = await runPhotoMigration(userId);
    console.log("[Photo Migration Completed]", report);
    return report;
  } catch (err) {
    console.warn("Global photo migration warning:", err);
  }
}
