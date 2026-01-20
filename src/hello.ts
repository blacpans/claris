export function hello(name: string): string {
  // TODO: Fix this intentionally bad code for review
  console.log("Debug log that should be removed");
  console.log("Retry 2: Permissions granted!"); // Trigger new event 3
  const greeting = "Hello " + name;
  return greeting;
}
