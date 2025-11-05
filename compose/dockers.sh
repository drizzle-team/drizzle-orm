docker run -d -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres -p 5432:5432 postgres:17-alpine
docker run -d -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=drizzle -e TZ=UTC -p 54322:5432 postgis/postgis:16-3.4
docker run -d -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=drizzle -p 54321:5432 pgvector/pgvector:pg16
docker run -it -d -p 3306:3306 -e MYSQL_ROOT_PASSWORD=mysql -e MYSQL_DATABASE=drizzle mysql:8
docker run -it -d -p 26257:26257 cockroachdb/cockroach:v25.2.0 start-single-node --insecure --store=type=mem,size=1GiB

docker run -it -d -p 1433:1433 \
 -e 'ACCEPT_EULA=1' \
 -e 'MSSQL_SA_PASSWORD=drizzle123PASSWORD!' \
 mcr.microsoft.com/azure-sql-edge

 docker run -d --name gel -p 56565:5656 \
  -e GEL_CLIENT_SECURITY=insecure_dev_mode \
  -e GEL_SERVER_SECURITY=insecure_dev_mode \
  -e GEL_CLIENT geldata/gel:latest

docker run -d --name singlestore -p 33307:3306 \
  -e ROOT_PASSWORD=singlestore \
  -e TZ=UTC \
  --health-cmd="bash -lc 'nc -z 127.0.0.1 3306'" \
  --health-interval=2s \
  --health-timeout=3s \
  --health-retries=60 \
  ghcr.io/singlestore-labs/singlestoredb-dev:latest

# macos
docker run -d --name singlestoredb-dev \
  -e ROOT_PASSWORD="password" \
  --platform linux/amd64 \
  -p 3306:3306 -p 8080:8080 -p 9000:9000 \
  ghcr.io/singlestore-labs/singlestoredb-dev:latest
# if the command above doesn't work for you on mac m1, try using version 0.2.57 of docker image.