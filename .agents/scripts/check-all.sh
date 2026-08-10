#!/bin/bash
set -euo pipefail

npm run check
npm run test
npm run build
