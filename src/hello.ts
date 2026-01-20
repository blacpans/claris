export function hello(name: string): string {
  // TODO: Fix this intentionally bad code for review
  console.log("Debug log that should be removed");
  console.log("Retry 6: Debug logs!"); // Trigger new event 7
  const greeting = "Hello " + name;
  return greeting;
}
