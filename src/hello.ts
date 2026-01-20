export function hello(name: string): string {
  // TODO: Fix this intentionally bad code for review
  console.log("Debug log that should be removed");
  console.log("Retry 3: Firestore fix deployed!"); // Trigger new event 4
  const greeting = "Hello " + name;
  return greeting;
}
