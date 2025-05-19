export interface BotPersonality {
  name: string;
  tagline: string;
  persona: string;
  light_traits: string[];
  dark_traits: string[];
  behavioural_prompt: string[];
  likes_keywords: string[];
  dislikes_keywords: string[];
  reactions: {
    like: string[];
    dislike: string[];
  };
  speak_prob_on_like: number;
  speak_prob_on_dislike: number;
  read_probability: number;
  idle_probability: number;
}

export interface Message {
  id: string;
  content: string;
  authorId: string;
  createdAt: string;
  interesting?: boolean;
  reaction?: string;
  like?: boolean;
  dislike?: boolean;
  positiveAlternativeThought?: string | null;
  negativeAlternativeThought?: string | null;
  randomThought?: string | null;
}
