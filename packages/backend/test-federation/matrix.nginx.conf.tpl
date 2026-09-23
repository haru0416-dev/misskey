map $http_upgrade $connection_upgrade {
  default upgrade;
  '' close;
}
server {
  listen 443 ssl;
  server_name ${HOST};
  ssl_certificate /etc/nginx/certificates/${HOST}.crt;
  ssl_certificate_key /etc/nginx/certificates/${HOST}.key;
  client_max_body_size 80m;
  location ~ ^/(users/[^/]+/)?inbox$ {
    proxy_pass http://fault-proxy:8080;
    proxy_set_header X-Federation-Target ${HOST};
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_http_version 1.1;
    proxy_next_upstream off;
  }
  location / {
    proxy_pass http://misskey.${HOST}:3000;
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
  }
}
