import React from "react";

const Footer = () => {
	var d = new Date();
	return (
		<div className="footer">
			<div className="copyright border-top">
				<p>Diseñado y desarrollado por Edwin Noriega {d.getFullYear()}</p>
			</div>
		</div>
	);
};

export default Footer;
