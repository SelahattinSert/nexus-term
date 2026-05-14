export const voiceFunctionSchema = {
  name: 'execute_action',
  description: 'Executes a system or terminal command based on the user intent.',
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['execute_terminal_command', 'execute_ui_action', 'text_response'],
        description: 'The type of action to perform.'
      },
      command: {
        type: 'string',
        description: 'The shell command to execute if type is execute_terminal_command. Ensure it is appropriate for the current OS.'
      },
      action: {
        type: 'string',
        description: 'The UI action to execute if type is execute_ui_action. e.g., "open_settings", "clear_terminal", "close_tab"'
      },
      response: {
        type: 'string',
        description: 'A conversational text response to the user.'
      }
    },
    required: ['type']
  }
};
