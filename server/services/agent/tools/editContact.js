const args = require("../../../utils/args");
const { ValidationError } = require("../../../utils/errors");

function requireContact(ctx, input) {
  const id = args.id(input, "contact_id", { required: true });
  const contact = ctx.store.contacts.get(id);
  if (!contact) throw new ValidationError(`Contact #${id} does not exist.`);
  return contact;
}

function createUpdateContactTool(ctx) {
  return {
    name: "update_contact",
    description: "Fix or fill in a saved contact: name, title, LinkedIn URL or email. An empty string clears a field.",
    parameters: {
      type: "object",
      properties: {
        contact_id: { type: "integer" },
        name: { type: "string" },
        title: { type: "string" },
        linkedin_url: { type: "string" },
        email: { type: "string" },
      },
      required: ["contact_id"],
    },
    async execute(input) {
      const contact = requireContact(ctx, input);
      const updated = ctx.store.contacts.update(contact.id, {
        name: args.text(input, "name", { max: 200 }),
        title: input.title === "" ? "" : args.text(input, "title", { max: 200 }),
        linkedin_url: input.linkedin_url === "" ? null : args.url(input, "linkedin_url"),
        email: input.email === "" ? null : args.email(input, "email"),
      });
      return { status: "updated", contact: updated };
    },
  };
}

function createDeleteContactTool(ctx) {
  return {
    name: "delete_contact",
    description: "Delete a saved contact the user says is wrong or not needed. Messages written to them are kept.",
    parameters: {
      type: "object",
      properties: { contact_id: { type: "integer" } },
      required: ["contact_id"],
    },
    async execute(input) {
      const contact = requireContact(ctx, input);
      ctx.store.contacts.delete(contact.id);
      return { status: "deleted", name: contact.name };
    },
  };
}

module.exports = { createUpdateContactTool, createDeleteContactTool };
