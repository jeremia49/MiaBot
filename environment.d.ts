declare global {
    namespace NodeJS {
      interface ProcessEnv {
        FILEAUTH: string;
        AUTHORIZED_USERS: string;
        PREFIX_COMMAND: string;
      }
    }
  }

export {}