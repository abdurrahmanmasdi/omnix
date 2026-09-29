#!/bin/bash
sed -i '' 's/\/\/ @ts-nocheck//g' src/lib/__tests__/identity-switch.test.tsx
sed -i '' 's/expect(screen.getByText('"'"'Loading'"'"')).toBeInTheDocument();/\/\/ @ts-ignore\
    expect(screen.getByText('"'"'Loading'"'"')).toBeInTheDocument();/g' src/lib/__tests__/identity-switch.test.tsx
sed -i '' 's/expect(screen.queryByText('"'"'Patient orgA'"'"')).not.toBeInTheDocument();/\/\/ @ts-ignore\
      expect(screen.queryByText('"'"'Patient orgA'"'"')).not.toBeInTheDocument();/g' src/lib/__tests__/identity-switch.test.tsx
sed -i '' 's/expect(screen.getByText('"'"'Patient orgB'"'"')).toBeInTheDocument();/\/\/ @ts-ignore\
      expect(screen.getByText('"'"'Patient orgB'"'"')).toBeInTheDocument();/g' src/lib/__tests__/identity-switch.test.tsx
