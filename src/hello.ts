export function hello(name: string): string {
  // TODO: Fix this intentionally bad code for review
  console.log("Debug log that should be removed");
  console.log("Retry 5: Sanitized Firestore!"); // Trigger new event 6
  const greeting = "Hello " + name;
  return greeting;
}
