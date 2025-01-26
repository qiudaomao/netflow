# netflow render for routerOS

accept ros use traffic flow

get dhcp lease and dns cache to display domain or host name for IPs

usage:

```shell
# normally use
npm install
node server.js http://admin:password@host:port
npm run build
npm run preview
open http://localhost:4173
```

use docker instead:

```shell
docker run -p 3000:3000/udp \
	-p 4173:4173 -e VITE_PORT=4173 \
	-e ROS_URL=http://admin:password@192.168.23.1:8080 qiudaomao/netflow
```

```shell
# routerOS needs enable traffic flow and add target with your host IP:3000
```
example:

![](resources/netflow.png)
