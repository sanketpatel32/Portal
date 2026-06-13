import {
  ClockTodoModel,
  IClockTodoDocument,
  createClockTodoSchema,
  parseClockTodoDeadline,
  updateClockTodoSchema,
} from "./db";
import {
  createGoogleCalendarEventForTodo,
  deleteGoogleCalendarEvent,
  getGoogleCalendarStatus,
  listGoogleCalendarEvents,
  updateGoogleCalendarEventForTodo,
  type GoogleCalendarEvent,
} from "./google-calendar";

export type AgendaTodoItem = {
  kind: "todo";
  id: string;
  title: string;
  deadline: string;
  allDay: boolean;
  completed: boolean;
  googleEventId?: string;
  syncToGoogle: boolean;
};

export type AgendaEventItem = GoogleCalendarEvent & { kind: "event" };

export type AgendaItem = AgendaTodoItem | AgendaEventItem;

function todoToAgendaItem(doc: IClockTodoDocument): AgendaTodoItem {
  const json = doc.toJSON() as AgendaTodoItem & { deadline: Date };
  return {
    kind: "todo",
    id: json.id,
    title: json.title,
    deadline: new Date(json.deadline).toISOString(),
    allDay: json.allDay,
    completed: json.completed,
    googleEventId: json.googleEventId,
    syncToGoogle: json.syncToGoogle,
  };
}

function sortKey(iso: string): number {
  return new Date(iso).getTime();
}

export async function listClockTodos(includeCompleted = false) {
  const filter = includeCompleted ? {} : { completed: false };
  const todos = await ClockTodoModel.find(filter).sort({ deadline: 1, createdAt: 1 });
  return todos.map((todo) => todo.toJSON());
}

export async function buildClockAgenda(days = 14): Promise<{
  todos: AgendaTodoItem[];
  events: AgendaEventItem[];
  items: AgendaItem[];
  googleConnected: boolean;
}> {
  const rangeEnd = new Date();
  rangeEnd.setDate(rangeEnd.getDate() + days);

  const todos = await ClockTodoModel.find({
    completed: false,
    deadline: { $lte: rangeEnd },
  }).sort({ deadline: 1 });

  const todoItems = todos.map(todoToAgendaItem);

  let eventItems: AgendaEventItem[] = [];
  let googleConnected = false;

  const status = await getGoogleCalendarStatus();
  googleConnected = status.connected;

  if (googleConnected) {
    try {
      const events = await listGoogleCalendarEvents(days);
      const syncedEventIds = new Set(
        todoItems.map((todo) => todo.googleEventId).filter((id): id is string => Boolean(id))
      );
      eventItems = events
        .filter((event) => !syncedEventIds.has(event.id))
        .map((event) => ({ ...event, kind: "event" as const }));
    } catch {
      eventItems = [];
    }
  }

  const items: AgendaItem[] = [...todoItems, ...eventItems].sort(
    (a, b) => sortKey(a.kind === "todo" ? a.deadline : a.start) - sortKey(b.kind === "todo" ? b.deadline : b.start)
  );

  return { todos: todoItems, events: eventItems, items, googleConnected };
}

export async function createClockTodo(input: unknown) {
  const validated = createClockTodoSchema.parse(input);
  const deadline = parseClockTodoDeadline(validated.deadline, validated.allDay);

  let googleEventId: string | undefined;
  if (validated.syncToGoogle) {
    const status = await getGoogleCalendarStatus();
    if (status.connected) {
      googleEventId = await createGoogleCalendarEventForTodo({
        title: validated.title,
        deadline,
        allDay: validated.allDay,
      });
    }
  }

  const todo = await ClockTodoModel.create({
    title: validated.title,
    deadline,
    allDay: validated.allDay,
    syncToGoogle: validated.syncToGoogle,
    googleEventId,
  });

  return todo.toJSON();
}

export async function updateClockTodo(id: string, input: unknown) {
  const validated = updateClockTodoSchema.parse(input);
  const todo = await ClockTodoModel.findById(id);
  if (!todo) {
    throw new Error("Todo not found");
  }

  if (validated.title !== undefined) todo.title = validated.title;
  if (validated.allDay !== undefined) todo.allDay = validated.allDay;
  if (validated.completed !== undefined) todo.completed = validated.completed;
  if (validated.syncToGoogle !== undefined) todo.syncToGoogle = validated.syncToGoogle;

  if (validated.deadline !== undefined) {
    todo.deadline = parseClockTodoDeadline(validated.deadline, validated.allDay ?? todo.allDay);
  }

  const status = await getGoogleCalendarStatus();

  if (todo.syncToGoogle && status.connected) {
    if (todo.googleEventId) {
      if (todo.completed) {
        await deleteGoogleCalendarEvent(todo.googleEventId);
        todo.googleEventId = undefined;
      } else {
        await updateGoogleCalendarEventForTodo(todo.googleEventId, {
          title: todo.title,
          deadline: todo.deadline,
          allDay: todo.allDay,
        });
      }
    } else if (!todo.completed) {
      todo.googleEventId = await createGoogleCalendarEventForTodo({
        title: todo.title,
        deadline: todo.deadline,
        allDay: todo.allDay,
      });
    }
  } else if (todo.googleEventId && (!todo.syncToGoogle || !status.connected)) {
    try {
      await deleteGoogleCalendarEvent(todo.googleEventId);
    } catch {
      // ignore cleanup failures
    }
    todo.googleEventId = undefined;
  }

  await todo.save();
  return todo.toJSON();
}

export async function deleteClockTodo(id: string) {
  const todo = await ClockTodoModel.findById(id);
  if (!todo) {
    throw new Error("Todo not found");
  }

  if (todo.googleEventId) {
    try {
      await deleteGoogleCalendarEvent(todo.googleEventId);
    } catch {
      // ignore cleanup failures
    }
  }

  await ClockTodoModel.findByIdAndDelete(id);
  return { id };
}
