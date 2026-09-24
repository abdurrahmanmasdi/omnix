import re

with open('app/modules/agent/nodes.py', 'r') as f:
    content = f.read()

# Fix the stages
content = content.replace(
    'async def value_pitch_node', 
    '__MARKER__VALUE_PITCH__async def value_pitch_node'
)
content = content.replace(
    'async def closing_node', 
    '__MARKER__CLOSING__async def closing_node'
)
content = content.replace(
    'async def general_qa_node', 
    '__MARKER__GENERAL_QA__async def general_qa_node'
)

# Now iterate through markers to fix the stage
parts = content.split('__MARKER__')
new_parts = [parts[0]]
for p in parts[1:]:
    stage = p.split('__')[0]
    rest = p[len(stage)+2:]
    
    # replace "QUALIFYING" with stage in this part
    rest = rest.replace('"current_stage": "QUALIFYING"', f'"current_stage": "{stage}"', 1)
    new_parts.append(rest)

content = "".join(new_parts)

# Fix unquoted keys globally
content = content.replace('state.get(pending_crm_actions', 'state.get("pending_crm_actions"')
content = content.replace('hasattr(response, tool_calls)', 'hasattr(response, "tool_calls")')
content = content.replace('tool_call[id]', 'tool_call["id"]')
content = content.replace('action in parsed', '"action" in parsed')

with open('app/modules/agent/nodes.py', 'w') as f:
    f.write(content)

