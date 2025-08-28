---
layout: post
title:  "How to customize PostgreSQL Docker Initialization the Right Way"
date:   2025-07-29
categories:
- devops
- database
tags:
- postgresql
- docker
- devops
---

Dockerizing Postgres is easy - until you need to initialize multiple databases with different dumps. Here is a clean way to do it using just a shell script.

## Official Postgres image is great

PostgreSQL is a mature and feature-rich database that continues to gain popularity among developers—and for good reason. One of its standout strengths, especially when it comes to SQL workloads, is write performance. PostgreSQL simply excels at it.

There’s plenty of online discussion around the many benefits of Postgres, so I won’t rehash them here. Instead, I want to highlight a lesser-known but very useful trick involving the official Postgres container image.

If you’ve ever used [the official Postgres Docker image](https://hub.docker.com/_/postgres), you know it has solid documentation and is easy to get started with. A particularly handy feature is how it handles database initialization. If you have an SQL dump, you can just mount your `.sql` files into the `/docker-entrypoint-initdb.d/` directory. When the container starts—and only if the data directory is empty—those SQL files will be automatically executed to initialize the database. Pretty neat.

Most deployments I’ve seen rely on this behavior: dump your SQL files into `/docker-entrypoint-initdb.d`, and you're good to go. But here’s where it gets tricky—and interesting.

## The limitation with subdirectories

Imagine you’re running a single Postgres instance that hosts **multiple databases**. They all share the same schema (say, your backend app uses the same structure for different projects), but the SQL dump files differ in content. You might be tempted to organize your initialization scripts into subdirectories within `/docker-entrypoint-initdb.d` - but that won’t work. The entrypoint script only executes SQL files located directly in `/docker-entrypoint-initdb.d`, not inside subfolders.

## The Shell script workaround

Here’s the trick: the entrypoint script doesn’t just look for `.sql` files. It also looks for **executable shell scripts (*.sh)**. If a shell script is _executable_, the entrypoint will run it—giving you the flexibility to write your own logic. That includes traversing subdirectories and initializing multiple databases however you like.

You can see this behavior in action, for example, in the [Postgres 17 Alpine 3.21 image](https://github.com/docker-library/postgres/blob/master/17/alpine3.21/docker-entrypoint.sh#L184). It’s a really clever design decision that allows you to extend the default behavior without modifying the image itself.

So next time you need more complex initialization logic, just drop an executable shell script into `/docker-entrypoint-initdb.d`. It’s an elegant and powerful way to take full control over how your Postgres container is bootstrapped.

## Putting It into Practice

Here’s a minimal example of how you can use a shell script inside `/docker-entrypoint-initdb.d` to initialize multiple databases from separate SQL dumps:

```shell
# /docker-entrypoint-initdb.d/init-multi-db.sh
#!/bin/bash
set -e

for db in project1 project2; do
  echo "Creating database: $db"
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -c "CREATE DATABASE \"${db}\""

  echo "Initializing $db..."
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" --dbname="$db" -f "/sql-dumps/$db/init.sql"
done
```
Make sure the script is marked as executable (`chmod +x`) before building or mounting it into the container.

In this setup:
1. Each database (`project1`, `project2`) is created explicitly.
2. SQL dumps are organized under `/sql-dumps/project1/init.sql`, etc.
3. The script lives in `/docker-entrypoint-initdb.d` and will be picked up automatically by the container's entrypoint.

It’s a simple pattern, but incredibly flexible—and avoids polluting your root init folder with a bunch of SQL files that may conflict in naming.