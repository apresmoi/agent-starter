// src/scene/types.ts

export interface Scene {
    title: string;
    timeOfDay: string;
    location: {
      name: string;
      description: string;
    },
    mood: string;
    plotHook: string;
    props: string[];
}


export interface Message {
  id: string;
  content: string;
  authorId: string;
  createdAt: string;
}

export interface Premise {
    series_premise: string[];
}