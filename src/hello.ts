export function hello(name: string): string {
  // TODO: Fix this intentionally bad code for review
  console.log("Debug log that should be removed");
  console.log("Retry 4: Flash model + Logs!"); // Trigger new event 5
  const greeting = "Hello " + name;
  return greeting;
}
