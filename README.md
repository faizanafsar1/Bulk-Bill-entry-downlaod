# Bulk Bill Entry Page - Next.js

A Next.js application for bulk bill entry and scanning using OCR technology.

## Features

- Bulk bill entry form with CSV export
- Camera-based bill scanning using OCR
- Support for Gas (SNGPL) and Electricity (IESCO) bills
- Real-time text detection from camera feed

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

1. Install dependencies:
```bash
npm install
```

2. Create a `.env.local` file in the root directory:
```env
NEXT_PUBLIC_API_KEY=your_ocr_space_api_key
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Project Structure

```
src/
├── app/              # Next.js App Router pages
│   ├── layout.tsx    # Root layout
│   ├── page.tsx      # Home page
│   ├── gas/          # Gas bill scanner page
│   └── iesco/        # IESCO bill scanner page
├── components/       # React components
├── hooks/           # Custom React hooks
└── ...
```

## Technologies

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS
- OCR.space API
- React Toastify

## Migration from Vite

This project was migrated from Vite + React to Next.js + TypeScript. Key changes:

- App Router routing instead of React Router
- TypeScript for type safety
- Next.js file-based routing
- Environment variables: `VITE_*` → `NEXT_PUBLIC_*`
