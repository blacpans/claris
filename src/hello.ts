export function hello(name: string): string {
  // TODO: Fix this intentionally bad code for review
  console.log("Debug log that should be removed");
  console.log("Another debug log for retry"); // Trigger new event
  const greeting = "Hello " + name;
  return greeting;
}
