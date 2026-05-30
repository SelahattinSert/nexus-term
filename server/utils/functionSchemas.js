export const voiceFunctionSchemas = [
  {
    type: 'function',
    function: {
      name: 'execute_terminal_command',
      description: 'Executes a raw terminal or shell command (e.g. ls, cd, npm install).',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The exact, raw shell command to execute. Do not wrap in markdown.'
          }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'execute_ui_action',
      description: 'Executes a NexusTerm Application UI action.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: [
              'clear_terminal', 
              'split_horizontal', 
              'split_vertical', 
              'toggle_file_manager', 
              'toggle_theme', 
              'open_settings', 
              'close_tab'
            ],
            description: 'The exact UI action ID to execute.'
          }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'text_response',
      description: 'Provides a conversational text response to the user.',
      parameters: {
        type: 'object',
        properties: {
          response: {
            type: 'string',
            description: 'The text response to display to the user.'
          }
        },
        required: ['response']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'ssh_connect',
      description: 'Connects to a saved SSH profile and opens a new terminal tab.',
      parameters: {
        type: 'object',
        properties: {
          profile_name: {
            type: 'string',
            description: 'The exact name of the SSH profile to connect to.'
          }
        },
        required: ['profile_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'ssh_run_on',
      description: 'Connects to an SSH profile (if not already connected) and runs a command on the remote server.',
      parameters: {
        type: 'object',
        properties: {
          profile_name: {
            type: 'string',
            description: 'The exact name of the SSH profile to run the command on.'
          },
          command: {
            type: 'string',
            description: 'The raw bash command to execute on the remote server.'
          }
        },
        required: ['profile_name', 'command']
      }
    }
  }
];
