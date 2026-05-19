# Allora - AI Profile-Building Agent

Allora is a FastAPI + LangGraph service that builds a dating-app user profile through natural conversation.

The agent learns about the user's personality, interests, hobbies, social style, emotional style, favorite environments, dislikes, and conversation preferences. It stores that profile as long-term memory by `user_id`, while each `thread_id` keeps short-term conversation context.

## What The Agent Handles

The frontend handles fixed onboarding fields such as age, gender, dating goals, and profile settings.

Allora handles softer profile signals:

- Interests and hobbies
- Personality traits
- Social style
- Vibe summary
- Favorite environments
- Dislikes and turn-offs
- Emotional style
- Recent life context
- Conversation preferences

Every chat turn should extract useful signal and update memory when the user says something profile-relevant.

## Architecture

```text
FastAPI
  POST   /chat
  GET    /profile/{user_id}
  PATCH  /profile/{user_id}/profile-memory/{category}
  DELETE /profile/{user_id}
  GET    /health

LangGraph
  load_memories -> profile_agent -> extract_and_save

Memory
  profile_memory
  context_memory
  preference_memory
```

## Setup

Create and activate a virtual environment:

```powershell
python -m venv venv
.\venv\Scripts\activate
```

Install dependencies:

```powershell
pip install -r requirements.txt
```

Create `.env` and add your Groq key if you want the live model:

```text
GROQ_API_KEY=your_key_here
```

Start the API:

```powershell
.\venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

If port `8000` is busy, use another port:

```powershell
.\venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

Run the console chat:

```powershell
python docs/console_chat.py
```

If the API is on a non-default port:

```powershell
$env:ALLORA_BASE_URL="http://127.0.0.1:8001"
python docs/console_chat.py
```

Open API docs:

```text
http://127.0.0.1:8000/docs
```

## API Reference

### POST `/chat`

Sends a natural conversation message to the profile-building agent.

Request:

```json
{
  "user_id": "user_abc123",
  "thread_id": "session-001",
  "message": "Me gusta bailar, cocinar y prefiero lugares tranquilos con poco ruido."
}
```

Response:

```json
{
  "assistant_message": "Bailar y cocinar dicen mucho de ti...",
  "memory_updates": {
    "profile_memory": {
      "interests": ["bailar", "cocinar"],
      "traits": [],
      "social_style": "prefers calm, intimate, low-noise environments",
      "vibe_summary": "Reflective person who prefers calm, intimate spaces.",
      "favorite_environments": ["lugares tranquilos", "poco ruido"],
      "hobbies": ["bailar", "cocinar"],
      "dislikes": [],
      "emotional_style": null
    },
    "context_memory": {
      "recent_topics": ["bailar", "cocinar", "lugares tranquilos", "poco ruido"],
      "evolving_interests": [],
      "life_updates": [],
      "recent_social_behavior": null,
      "current_mood_theme": null
    },
    "preference_memory": {
      "conversation_style": null,
      "prefers_short_questions": false,
      "depth_preference": null,
      "sensitive_topics": []
    }
  },
  "conversation_state": {
    "profile_completion": 0.31,
    "should_continue": true,
    "turn_count": 1
  }
}
```

### GET `/profile/{user_id}`

Returns the full accumulated profile for one user.

Example:

```powershell
python -c "import httpx; print(httpx.get('http://127.0.0.1:8000/profile/user_abc123').json())"
```

Response shape:

```json
{
  "user_id": "user_abc123",
  "profile_memory": {
    "interests": [],
    "personality_traits": [],
    "social_style": null,
    "vibe_summary": null,
    "favorite_environments": [],
    "hobbies": [],
    "dislikes": [],
    "emotional_style": null
  },
  "context_memory": {
    "recent_topics": [],
    "evolving_interests": [],
    "recent_life_changes": [],
    "recent_social_behavior": null,
    "current_mood_theme": null
  },
  "preference_memory": {
    "conversation_style": null,
    "prefers_short_questions": false,
    "depth_preference": null,
    "sensitive_topics": [],
    "response_length_preference": null
  },
  "profile_completion": 0.0
}
```

### PATCH `/profile/{user_id}/profile-memory/{category}`

Directly edits exactly one `profile_memory` category.

Use this endpoint when the user chooses to edit one profile section manually in the app. It does not run the chat agent and it does not update any other category. The selected category is replaced with a clean formatted value based only on the user's submitted text.

Valid categories:

- `interests`
- `personality_traits`
- `traits` - alias for `personality_traits`
- `social_style`
- `vibe_summary`
- `favorite_environments`
- `hobbies`
- `dislikes`
- `emotional_style`

Request:

```json
{
  "text": "lugares intimos y tranquilos, poco ruido, cafes"
}
```

Example for list categories:

```powershell
python -c "import httpx; r=httpx.patch('http://127.0.0.1:8000/profile/user_abc123/profile-memory/favorite_environments', json={'text':'lugares intimos y tranquilos, poco ruido, cafes'}); print(r.json())"
```

Response:

```json
{
  "user_id": "user_abc123",
  "category": "favorite_environments",
  "formatted_value": [
    "lugares intimos",
    "tranquilos",
    "poco ruido",
    "cafes"
  ],
  "profile_memory": {
    "interests": [],
    "personality_traits": [],
    "social_style": null,
    "vibe_summary": null,
    "favorite_environments": [
      "lugares intimos",
      "tranquilos",
      "poco ruido",
      "cafes"
    ],
    "hobbies": [],
    "dislikes": [],
    "emotional_style": null
  },
  "profile_completion": 0.04
}
```

Example for scalar categories:

```powershell
python -c "import httpx; r=httpx.patch('http://127.0.0.1:8000/profile/user_abc123/profile-memory/social_style', json={'text':'prefiero planes tranquilos, uno a uno, con poca presion social'}); print(r.json())"
```

Response:

```json
{
  "user_id": "user_abc123",
  "category": "social_style",
  "formatted_value": "Prefiero planes tranquilos, uno a uno, con poca presion social.",
  "profile_memory": {
    "interests": [],
    "personality_traits": [],
    "social_style": "Prefiero planes tranquilos, uno a uno, con poca presion social.",
    "vibe_summary": null,
    "favorite_environments": [],
    "hobbies": [],
    "dislikes": [],
    "emotional_style": null
  },
  "profile_completion": 0.12
}
```

### DELETE `/profile/{user_id}`

Deletes all memory for a user. Useful for testing.

Example:

```powershell
python -c "import httpx; print(httpx.delete('http://127.0.0.1:8000/profile/user_abc123').json())"
```

### GET `/health`

Health check.

```powershell
python -c "import httpx; print(httpx.get('http://127.0.0.1:8000/health').json())"
```

## Memory Model

### Profile Memory

Long-term identity:

- `interests`
- `personality_traits`
- `social_style`
- `vibe_summary`
- `favorite_environments`
- `hobbies`
- `dislikes`
- `emotional_style`

### Context Memory

Recent life state:

- `recent_topics`
- `evolving_interests`
- `recent_life_changes`
- `recent_social_behavior`
- `current_mood_theme`

### Preference Memory

How the user likes to interact:

- `conversation_style`
- `prefers_short_questions`
- `depth_preference`
- `sensitive_topics`
- `response_length_preference`

## Project Structure

```text
allora_agent/
  app/
    main.py
    agent/
      agent.py
    memory/
      memory_manager.py
    schemas/
      api.py
      memory.py
  docs/
    console_chat.py
    example_conversations.py
  requirements.txt
  README.md
```

## Deployment

For Render or any container platform, use:

```bash
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Set environment variables in the platform dashboard:

```text
GROQ_API_KEY=your_key_here
```

Do not commit `.env` or `venv/`.
