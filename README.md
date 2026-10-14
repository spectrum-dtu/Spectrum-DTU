```bash
npm install
cp apps/api/.env.example apps/api/.env     
npm run db:dev -w @spectrum/api      
npm run db:deploy -w @spectrum/api
npm run dev:api                          
npm run dev:web                             
```


## Checks
```bash
npm run typecheck && npm run build
npm test -w @spectrum/api                
```
