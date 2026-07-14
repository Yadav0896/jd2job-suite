const text = `{\n  "answer": "1. **Polymorphism**: It is the ability of an object to take on multiple forms, depending on the context in which it is used.\\n2. **Key Details**: This can be achieved through method overloading, method overriding, or operator overloading, allowing objects of different classes to be treated as if they were of the same class.\\n3. **Application / Metric**: Polymorphism is essential in object-oriented programming, enabling more flexibility and reusability in code, making it easier to write generic and adaptable software.",\n  "bulletPoints": [\n    "Polymorphism allows objects to behave differently in different situations.",\n    "Method overloading enables multiple methods with the same name but different parameters.",\n    "Method overriding allows a subclass to provide a different implementation of a method already defined in its superclass."\n  ],\n  "hints": ["Method overloading", "Method overriding", "Operator overloading"]\n}`;

const jsonMatch = text.match(/\{[\s\S]*\}/);
if (jsonMatch) {
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    console.log("Parsed OK");
  } catch(e) {
    console.log("Failed", e.message);
  }
}
